import fastq from 'fastq';
import { db } from './db/db';
import { User, Bang } from './type';
import { Request, Response } from 'express';
import { bangs as bangsTable } from './db/bang';
import { defaultSearchProviders } from './config';
import { addHttps, insertBookmarkQueue, insertPageTitleQueue, isValidUrl } from './util';
import { LRUCache } from 'lru-cache';

/**
 * Core configuration constants for the search functionality
 */
const searchConfig = {
    /**
     * List of bangs that are available to use from the bangs table
     */
    bangs: bangsTable,
    /**
     * Maximum number of searches allowed for unauthenticated users
     */
    searchLimit: 60,
    /**
     * Time penalty increment for exceeding search limit (in milliseconds)
     */
    delayIncrement: 5000,
    /**
     * System-level bang commands that cannot be overridden by user-defined bangs
     */
    systemBangs: ['!add', '!bm', '!note'] as const,
    /**
     * Direct commands that can be used to navigate to different sections of the application
     */
    directCommands: {
        '@a': '/actions',
        '@action': '/actions',
        '@actions': '/actions',
        '@admin': '/admin',
        '@am': '/admin',
        '@api': '/api-docs',
        '@b': '/',
        '@bang': '/',
        '@bangs': '/',
        '@bm': '/bookmarks',
        '@bookmark': '/bookmarks',
        '@bookmarks': '/bookmarks',
        '@data': '/settings/data',
        '@s': '/settings',
        '@settings': '/settings',
        '@n': '/notes',
        '@note': '/notes',
        '@notes': '/notes',
    },
} as const;

/**
 * Cache for frequently used bang redirects to avoid repeated processing
 * Improves performance by eliminating redundant URL generation for common bangs
 * Uses a fixed size LRU cache to manage memory usage and provide high-speed lookups
 */
export const bangCache = new LRUCache<string, string>({
    max: 100, // Maximum number of items to store
    ttl: 1000 * 60 * 60, // Cache TTL: 1 hour
});

/**
 * Cache for direct commands to avoid repeated lookups
 * Provides instant access to frequently used navigation commands
 * Uses a fixed size LRU cache with longer TTL since direct commands rarely change
 */
export const directCommandCache = new LRUCache<string, string>({
    max: 50,
    ttl: 1000 * 60 * 60 * 24, // 24 hours - these rarely change
});

/**
 * Queue for tracking search history of unauthenticated users asynchronously
 */
export const anonymousSearchHistoryQueue = fastq.promise(trackAnonymousUserSearch, 10);

/**
 * Tracks search history for unauthenticated users and manages rate limiting
 * Increments search count and applies cumulative delay if limit is exceeded
 */
export async function trackAnonymousUserSearch(req: Request) {
    // Initialize or get existing session counters
    req.session.searchCount = req.session.searchCount || 0;
    req.session.cumulativeDelay = req.session.cumulativeDelay || 0;

    req.session.searchCount += 1;

    // Apply delay penalty if search limit is exceeded
    if (req.session.searchCount > searchConfig.searchLimit) {
        req.session.cumulativeDelay += searchConfig.delayIncrement;
    }
}

/**
 * Sends an HTML response that redirects the user with an optional alert message
 */
export function redirectWithAlert(res: Response, url: string, message?: string) {
    return res.setHeader('Content-Type', 'text/html')
		.status(200)
		.send(`
			<script>
				${message ? `alert("${message}");` : ''}
				window.location.href = "${url}";
			</script>
		`); // prettier-ignore
}

/**
 * Sends an HTML error response with an alert message and browser history navigation
 */
export function goBackWithAlert(res: Response, message: string) {
    return res.setHeader('Content-Type', 'text/html')
		.status(422)
		.send(`
			<script>
				alert("${message}");
				window.history.back();
			</script>
		`); // prettier-ignore
}

export function goBack(res: Response) {
    return res.setHeader('Content-Type', 'text/html')
		.status(200)
		.send(`
			<script>
				window.history.back();
			</script>
		`); // prettier-ignore
}

/**
 * Parses a search query to extract components: bang trigger, URL, and search terms
 *
 * @param query - The raw search query string to parse
 * @returns Parsed components of the search query
 *
 * @example Basic search
 * parseSearchQuery("!g python")
 * → { commandType: "bang", trigger: "!g", triggerWithoutPrefix: "g", url: null, searchTerm: "python" }
 *
 * @example Direct command
 * parseSearchQuery("@notes search query")
 * → { commandType: "direct", trigger: "@notes", triggerWithoutPrefix: "notes", url: null, searchTerm: "search query" }
 *
 * @example Bookmark with title
 * parseSearchQuery("!bm My Bookmark https://example.com")
 * → { commandType: "bang", trigger: "!bm", triggerWithoutPrefix: "bm", url: "https://example.com", searchTerm: "My Bookmark" }
 *
 * @example Custom bang creation
 * parseSearchQuery("!add !custom https://custom-search.com")
 * → { commandType: "bang", trigger: "!add", triggerWithoutPrefix: "add", url: "https://custom-search.com", searchTerm: "!custom" }
 */
export function parseSearchQuery(query: string) {
    if (!query) {
        return {
            commandType: null,
            trigger: null,
            triggerWithoutPrefix: null,
            url: null,
            searchTerm: '',
        };
    }

    // Use a single pass approach to extract components
    const trimmedQuery = query.trim();
    const firstSpaceIndex = trimmedQuery.indexOf(' ');

    // Determine command type from the first character (faster than startsWith)
    const firstChar = trimmedQuery.charAt(0);
    const isBang = firstChar === '!';
    const isDirect = firstChar === '@';
    const commandType = isBang ? 'bang' : isDirect ? 'direct' : null;
    const isCommand = isBang || isDirect;

    // No spaces means it's either just a command or a single word search
    if (firstSpaceIndex === -1) {
        // If it starts with ! or @, it's a command-only query
        if (isCommand) {
            return {
                commandType,
                trigger: trimmedQuery,
                triggerWithoutPrefix: trimmedQuery.slice(1),
                url: null,
                searchTerm: '',
            };
        }

        // Otherwise it's just a single word search
        return {
            commandType: null,
            trigger: null,
            triggerWithoutPrefix: null,
            url: null,
            searchTerm: trimmedQuery,
        };
    }

    // Extract potential trigger (if query starts with ! or @)
    let trigger = null;
    let triggerWithoutPrefix = null;
    let remainingQuery = trimmedQuery;

    if (isCommand) {
        trigger = trimmedQuery.substring(0, firstSpaceIndex);
        triggerWithoutPrefix = trigger.slice(1);
        remainingQuery = trimmedQuery.substring(firstSpaceIndex + 1);
    }

    // Find URL using fast string search instead of regex
    // URLs will start with http:// or https://
    let url = null;
    let searchTerm = remainingQuery;

    // Only look for URLs in bang commands - direct commands don't use URLs
    if (commandType === 'bang') {
        // Common URL prefixes to check for
        const httpIndex = remainingQuery.indexOf('http://');
        const httpsIndex = remainingQuery.indexOf('https://');

        if (httpIndex !== -1 || httpsIndex !== -1) {
            // Find the earlier occurring URL protocol
            const urlStartIndex =
                httpIndex !== -1 && httpsIndex !== -1
                    ? Math.min(httpIndex, httpsIndex)
                    : Math.max(httpIndex, httpsIndex);

            // Extract the URL - find the end by locating the next space
            const urlEndIndex = remainingQuery.indexOf(' ', urlStartIndex);

            // If no space after URL, it goes to the end of the string
            if (urlEndIndex === -1) {
                url = remainingQuery.substring(urlStartIndex);

                // If URL is at the beginning, there's no search term
                if (urlStartIndex === 0) {
                    searchTerm = '';
                } else {
                    // Otherwise search term is everything before the URL
                    searchTerm = remainingQuery.substring(0, urlStartIndex).trim();
                }
            } else {
                // URL is in the middle, extract it and the search term
                url = remainingQuery.substring(urlStartIndex, urlEndIndex);

                // Combine parts before and after URL for the search term
                const beforeUrl = remainingQuery.substring(0, urlStartIndex).trim();
                const afterUrl = remainingQuery.substring(urlEndIndex).trim();

                if (beforeUrl && afterUrl) {
                    searchTerm = beforeUrl + ' ' + afterUrl;
                } else {
                    searchTerm = beforeUrl || afterUrl;
                }
            }
        }
    }

    // Normalize spaces in search term (required for test compatibility)
    if (searchTerm) {
        searchTerm = searchTerm.trim().replace(/\s+/g, ' ');
    }

    return {
        /**
         * The type of command (bang or direct)
         * Used to determine how to process the query
         * @example "bang" for !g, !bm, etc.
         * @example "direct" for @notes, @bookmarks, etc.
         * @example null for regular searches without a command
         */
        commandType,

        /**
         * The full command trigger including prefix ("!" or "@")
         * Used for command identification and routing
         * @example "!g" for Google search
         * @example "!bm" for bookmark command
         * @example "@notes" for notes navigation
         * @example null for regular searches
         */
        trigger,

        /**
         * Command trigger with prefix removed
         * Used for looking up commands in bangs table or direct commands mapping
         * @example "g" for Google search
         * @example "bm" for bookmark command
         * @example "notes" for notes navigation
         * @example null for regular searches
         */
        triggerWithoutPrefix,

        /**
         * First valid URL found in the query string
         * Used for bookmark creation and custom bang definition
         * Supports both http and https protocols
         * Only relevant for bang commands, not direct commands
         * @example "https://example.com" from "!bm title https://example.com"
         * @example null when no URL is present
         */
        url,

        /**
         * The search terms or content after removing trigger and URL
         * Multiple uses based on context:
         * - Search query for search bangs
         * - Title for bookmarks
         * - Trigger for custom bang creation
         * - Search term for direct commands with search like @notes search
         * @example "python" from "!g python"
         * @example "My Bookmark" from "!bm My Bookmark https://example.com"
         * @example "search term" from "@notes search term"
         */
        searchTerm,
    };
}

/**
 * Handles rate limiting for unauthenticated users
 * Returns warning message when search count reaches multiples of 10
 */
export function getSearchLimitWarning(req: Request, searchCount: number) {
    const searchesLeft = searchConfig.searchLimit - searchCount;
    const showWarning = searchCount % 10 === 0 && searchCount !== 0;

    if (showWarning) {
        const message =
            searchesLeft <= 0
                ? "You've exceeded the search limit for unauthenticated users. Please log in for unlimited searches without delays."
                : `You have used ${searchCount} out of ${searchConfig.searchLimit} searches. Log in for unlimited searches!`;
        return message;
    }

    return null;
}

/**
 * Initialize a Map for faster bang lookups
 * This provides O(1) access instead of iterating through the bangs object
 * Precomputing this map at startup offers significant performance benefits
 * for frequently accessed bangs
 */
function initializeBangMap() {
    const bangMap = new Map<string, Bang>();
    Object.entries(searchConfig.bangs).forEach(([key, value]) => {
        bangMap.set(key, value as Bang);
    });
    return bangMap;
}

// Precomputed bang lookup map for faster access
export const bangsLookupMap = initializeBangMap();

/**
 * Process a search request with the appropriate delay
 * Uses a non-blocking approach that doesn't affect concurrent requests
 * The delay is applied only to the specific rate-limited request
 */
export async function processDelayedSearch(req: Request): Promise<void> {
    if (req.session.cumulativeDelay) {
        await new Promise((resolve) => setTimeout(resolve, req.session.cumulativeDelay));
    }
}

/**
 * Optimized search handler for anonymous users
 * Uses the bang lookup map for faster access
 * Implements non-blocking rate limiting
 * Asynchronously tracks search history
 * Includes optimized paths for common bangs
 */
export async function handleAnonymousSearch(
    req: Request,
    res: Response,
    query: string,
    triggerWithoutBang: string,
    searchTerm: string,
) {
    const warningMessage = getSearchLimitWarning(req, req.session.searchCount ?? 0);

    // Display warning when user approaches or exceeds search limits
    if (warningMessage) {
        void anonymousSearchHistoryQueue.push(req);
        return redirectWithAlert(
            res,
            defaultSearchProviders['duckduckgo'].replace('{{{s}}}', encodeURIComponent(searchTerm)),
            warningMessage,
        );
    }

    // Asynchronously track search for analytics purposes
    void anonymousSearchHistoryQueue.push(req);

    // Enforce rate limiting delay for users who exceeded search limits
    if (req.session.cumulativeDelay) {
        // Create a non-blocking delay
        const delayPromise = processDelayedSearch(req);

        // Determine the redirect URL based on the bang
        let redirectUrl = '';
        const message = `This search was delayed by ${req.session.cumulativeDelay / 1000} seconds due to rate limiting.`;

        if (triggerWithoutBang) {
            // Use the Map for faster lookups instead of object property access
            const bang = bangsLookupMap.get(triggerWithoutBang);
            if (bang) {
                redirectUrl = getBangRedirectUrl(bang, searchTerm || '');
            } else {
                redirectUrl = defaultSearchProviders['duckduckgo'].replace(
                    '{{{s}}}',
                    encodeURIComponent(query),
                );
            }
        } else {
            redirectUrl = defaultSearchProviders['duckduckgo'].replace(
                '{{{s}}}',
                encodeURIComponent(query),
            );
        }

        // Wait for the delay to complete (won't block other requests)
        await delayPromise;

        // After the delay is done, redirect with a message
        return redirectWithAlert(res, redirectUrl, message);
    }

    // Process bang commands for unauthenticated users - use the Map for faster lookups
    if (triggerWithoutBang) {
        // Use the Map for faster lookups instead of object property access
        const bang = bangsLookupMap.get(triggerWithoutBang);
        if (bang) {
            // Handle search queries with bang (e.g., "!g python")
            if (searchTerm) {
                return res.redirect(getBangRedirectUrl(bang, searchTerm));
            }

            // Handle bang-only queries (e.g., "!g") - redirects to service homepage
            return res.redirect(getBangRedirectUrl(bang, ''));
        }
    }

    // Process regular search using DuckDuckGo (default for unauthenticated users)
    return res.redirect(
        defaultSearchProviders['duckduckgo'].replace('{{{s}}}', encodeURIComponent(query)),
    );
}

/**
 * Processes bang redirect URLs
 * Handles both search queries and direct domain redirects
 * Uses caching for frequently accessed bangs to improve performance
 * Properly encodes search terms for URL safety
 */
export function getBangRedirectUrl(bang: Bang, searchTerm: string) {
    // Create a cache key from the bang trigger and search term
    const cacheKey = `${bang.d || bang.u}:${searchTerm}`;

    // Check if we have a cached result
    const cachedUrl = bangCache.get(cacheKey);
    if (cachedUrl) {
        return cachedUrl;
    }

    // Process the URL as before
    let redirectUrl;
    if (searchTerm) {
        redirectUrl = bang.u.replace('{{{s}}}', encodeURIComponent(searchTerm));
    } else {
        redirectUrl = addHttps(bang.d);
    }

    // Cache the result for future use
    bangCache.set(cacheKey, redirectUrl);

    return redirectUrl;
}

/**
 * Processes search queries and handles different user flows
 * - Unauthenticated user flow: Handles rate limiting, bang commands, and default search
 * - Authenticated user flow: Handles direct navigation commands, bookmark creation, and custom bang commands
 */
export async function search({
    res,
    req,
    user,
    query,
}: {
    res: Response;
    req: Request;
    user?: User;
    query: string;
}) {
    const { commandType, trigger, triggerWithoutPrefix, url, searchTerm } = parseSearchQuery(query);

    // Handle direct commands (@) - process these first since they're fast and common
    if (commandType === 'direct') {
        const cachedDirectCommand = directCommandCache.get(query);
        if (cachedDirectCommand) {
            return res.redirect(cachedDirectCommand);
        }

        // For command-only queries like @notes, @bookmarks with no search term
        if (!searchTerm) {
            const directPath = searchConfig.directCommands[trigger as keyof typeof searchConfig.directCommands]; // prettier-ignore
            if (directPath) {
                directCommandCache.set(query, directPath);
                return res.redirect(directPath);
            }
        }

        // For commands with search terms like @notes search query
        if (searchTerm && trigger) {
            if (['@n', '@note', '@notes'].includes(trigger)) {
                const redirectPath = `/notes?search=${encodeURIComponent(searchTerm)}`;
                directCommandCache.set(query, redirectPath);
                return res.redirect(redirectPath);
            }

            if (['@bm', '@bookmark', '@bookmarks'].includes(trigger)) {
                const redirectPath = `/bookmarks?search=${encodeURIComponent(searchTerm)}`;
                directCommandCache.set(query, redirectPath);
                return res.redirect(redirectPath);
            }

            if (['@a', '@action', '@actions'].includes(trigger)) {
                const redirectPath = `/actions?search=${encodeURIComponent(searchTerm)}`;
                directCommandCache.set(query, redirectPath);
                return res.redirect(redirectPath);
            }
        }
    }

    // Process system-level bang commands (!bm, !add, !note)
    if (
        trigger &&
        commandType === 'bang' &&
        searchConfig.systemBangs.includes(trigger as (typeof searchConfig.systemBangs)[number])
    ) {
        if (!user) {
            return redirectWithAlert(res, '/login', 'Please log in to use this feature');
        }

        // Process bookmark creation command (!bm)
        // Format supported:
        // 1. !bm URL
        // Example: !bm https://example.com
        if (trigger === '!bm') {
            if (!url || !isValidUrl(url)) {
                return goBackWithAlert(res, 'Invalid or missing URL');
            }

            try {
                // Extract title from command by removing "!bm" and URL
                const urlIndex = query.indexOf(url!);
                const titleSection = query.slice(4, urlIndex).trim();

                void insertBookmarkQueue.push({
                    url,
                    title: titleSection || '',
                    userId: user.id,
                });

                return res.redirect(url);
            } catch (_error) {
                return redirectWithAlert(res, 'Error adding bookmark');
            }
        }

        // Process custom bang creation command (!add)
        // Format supported:
        // 1. !add !trigger URL
        // 2. !add trigger URL
        // Example: !add !custom https://custom-search.com
        // Example: !add custom https://custom-search.com
        if (trigger === '!add') {
            const [, rawTrigger, url] = query.split(' ');
            const trigger = rawTrigger?.startsWith('!') ? rawTrigger : `!${rawTrigger}`;

            // Validate command format
            if (!trigger || !url?.length) {
                return goBackWithAlert(res, 'Invalid trigger or empty URL');
            }

            // Prevent duplicates and system command conflicts
            const hasSystemBangCommands = searchConfig.systemBangs.includes(
                trigger as (typeof searchConfig.systemBangs)[number],
            );
            const hasExistingCustomBangCommand = await db('bangs')
                .where({ user_id: user.id, trigger })
                .first();

            if (hasExistingCustomBangCommand || hasSystemBangCommands) {
                let message = 'Trigger ${trigger} already exists. Please enter a new trigger:';

                if (hasSystemBangCommands) {
                    message = `${trigger} is a bang's systems command. Please enter a new trigger:`;
                }

                return res
                    .setHeader('Content-Type', 'text/html')
                    .status(422)
                    .send(`
                        <script>
                            const newTrigger = prompt("${message}");
                            if (newTrigger) {
                                const domain = window.location.origin;
                                window.location.href = \`\${domain}/?q=!add \${newTrigger} ${url}\`;
                            } else {
                                window.history.back();
                            }
                        </script>
                    `); // prettier-ignore
            }

            // Create new bang command and queue title fetch
            const bangs = await db('bangs')
                .insert({
                    user_id: user.id,
                    trigger,
                    name: 'Fetching title...',
                    action_type_id: 2, // redirect
                    url,
                })
                .returning('*');

            void insertPageTitleQueue.push({ actionId: bangs[0].id, url });

            return goBack(res);
        }

        // Process note creation command (!note)
        // Formats supported:
        // 1. !note this is the title | this is the content
        // 2. !note this is the content without title
        // Example: !note this is the title | this is the content
        // Example: !note this is the content without title
        if (trigger === '!note') {
            const contentStartIndex = query.indexOf(' ');
            const fullContent = query.slice(contentStartIndex + 1).trim();

            // If content contains a pipe, split into title and content
            const hasPipe = fullContent.includes('|');
            let title = '';
            let content = fullContent;

            if (hasPipe) {
                const parts = fullContent.split('|');
                title = parts[0]?.trim() || '';
                content = parts[1]?.trim() || '';
            }

            if (!content) {
                return goBackWithAlert(res, 'Content is required');
            }

            await db('notes').insert({
                user_id: user.id,
                title: title || 'Untitled',
                content,
            });

            return goBack(res);
        }
    }

    if (!user) {
        return handleAnonymousSearch(req, res, query, triggerWithoutPrefix ?? '', searchTerm ?? '');
    }

    if (commandType === 'bang' && triggerWithoutPrefix) {
        const customBang = await db('bangs')
            .where({
                user_id: user.id,
                trigger: trigger,
            })
            .join('action_types', 'bangs.action_type_id', 'action_types.id')
            .select('bangs.*', 'action_types.name as action_type')
            .first();

        if (customBang) {
            if (customBang.action_type === 'search') {
                return res.redirect(
                    customBang.url.replace('{{{s}}}', encodeURIComponent(searchTerm ?? '')),
                );
            }

            if (customBang.action_type === 'redirect') {
                return res.redirect(customBang.url);
            }

            if (customBang.action_type === 'bookmark') {
                return res.redirect(`/bookmarks#${customBang.id}`);
            }
        }
    }

    // Process system-defined bang commands
    if (commandType === 'bang' && triggerWithoutPrefix) {
        const bang = bangsLookupMap.get(triggerWithoutPrefix);
        if (bang) {
            // Handle search queries with bang (e.g., "!g python")
            if (searchTerm) {
                return res.redirect(getBangRedirectUrl(bang, searchTerm));
            }

            // Handle special cases where bang URL requires search parameter
            // Example: DuckDuckGo timer (!timer)
            if (bang.u.includes('{{{s}}}')) {
                return res.redirect(getBangRedirectUrl(bang, searchTerm));
            }

            // Handle bang-only queries - redirect to service homepage
            return res.redirect(getBangRedirectUrl(bang, ''));
        }
    }

    // Process default search using user's preferred search engine
    const defaultProvider = user.default_search_provider || 'duckduckgo';

    // Handle regular search queries or fallback for unknown bangs
    let searchUrl = defaultSearchProviders[defaultProvider].replace('{{{s}}}', encodeURIComponent(searchTerm || query)); // prettier-ignore

    // Handle unknown bang commands by searching for them without the "!"
    if (commandType === 'bang' && !searchTerm && triggerWithoutPrefix) {
        searchUrl = defaultSearchProviders[defaultProvider].replace('{{{s}}}', encodeURIComponent(triggerWithoutPrefix)); // prettier-ignore
    }

    return res.redirect(searchUrl);
}
