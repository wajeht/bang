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
        '@actions': '/actions',
        '@admin': '/admin',
        '@am': '/admin',
        '@api': '/api-docs',
        '@b': '/',
        '@bang': '/',
        '@bangs': '/',
        '@bm': '/bookmarks',
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
 * → { trigger: "!g", triggerWithoutBang: "g", url: null, searchTerm: "python" }
 *
 * @example Bookmark with title
 * parseSearchQuery("!bm My Bookmark https://example.com")
 * → { trigger: "!bm", triggerWithoutBang: "bm", url: "https://example.com", searchTerm: "My Bookmark" }
 *
 * @example Custom bang creation
 * parseSearchQuery("!add !custom https://custom-search.com")
 * → { trigger: "!add", triggerWithoutBang: "add", url: "https://custom-search.com", searchTerm: "!custom" }
 */
export function parseSearchQuery(query: string) {
    // Sanitize input
    const sanitizedQuery = query.trim().replace(/\s+/g, ' ');

    // Enhanced regex patterns
    const triggerPattern = /^(![\w-]+)/; // Supports hyphens in triggers
    const urlPattern = /\s+((?:https?:\/\/)[^\s]+)/i; // Case-insensitive, more permissive URL matching

    // Extract components
    const triggerMatch = sanitizedQuery.match(triggerPattern);
    const urlMatch = sanitizedQuery.match(urlPattern);

    const trigger = triggerMatch?.[1]?.toString() ?? null;
    const triggerWithoutExclamationMark = trigger?.slice(1) ?? null;
    const url = urlMatch?.[1] ?? null;

    // Process search term with URL removal
    let searchTerm = trigger ? sanitizedQuery.slice(trigger.length) : sanitizedQuery;

    if (url) {
        searchTerm = searchTerm.replace(url, '');
    }

    // Clean up search term
    searchTerm = searchTerm.trim().replace(/\s+/g, ' ');

    return {
        /**
         * The full bang trigger including "!" prefix
         * Used for command identification and routing
         * @example "!g" for Google search
         * @example "!bm" for bookmark command
         * @example "!add" for adding custom bangs
         */
        trigger,

        /**
         * Bang trigger with "!" prefix removed
         * Used for looking up commands in bangs table
         * @example "g" for Google search
         * @example "bm" for bookmark command
         */
        triggerWithoutExclamationMark,

        /**
         * First valid URL found in the query string
         * Used for bookmark creation and custom bang definition
         * Supports both http and https protocols
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
         * @example "python" from "!g python"
         * @example "My Bookmark" from "!bm My Bookmark https://example.com"
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
    // Fast path for direct commands - check first since they're the fastest to process
    // First check cache
    const cachedDirectCommand = directCommandCache.get(query);
    if (cachedDirectCommand) {
        return res.redirect(cachedDirectCommand);
    }

    // Then check in searchConfig
    const directCommand = searchConfig.directCommands[query as keyof typeof searchConfig.directCommands]; // prettier-ignore

    if (directCommand) {
        // Cache for future use
        directCommandCache.set(query, directCommand);
        return res.redirect(directCommand);
    }

    // Handle direct commands with search terms
    if (query.startsWith('@') && query.includes(' ')) {
        const parts = query.split(' ');
        const command = parts[0] as string;
        const searchTerm = parts.slice(1).join(' ');

        if (Object.keys(searchConfig.directCommands).includes(command)) {
            if (['@note', '@notes', '@n'].includes(command)) {
                directCommandCache.set(query, `/notes?search=${encodeURIComponent(searchTerm)}`);
                return res.redirect(`/notes?search=${encodeURIComponent(searchTerm)}`);
            }

            if (['@bm', '@bookmarks'].includes(command)) {
                directCommandCache.set(
                    query,
                    `/bookmarks?search=${encodeURIComponent(searchTerm)}`,
                );
                return res.redirect(`/bookmarks?search=${encodeURIComponent(searchTerm)}`);
            }

            if (['@a', '@actions'].includes(command)) {
                directCommandCache.set(query, `/actions?search=${encodeURIComponent(searchTerm)}`);
                return res.redirect(`/actions?search=${encodeURIComponent(searchTerm)}`);
            }
        }
    }

    // Fast path for system bang commands - check early since they're frequently used
    const { trigger, triggerWithoutExclamationMark, url, searchTerm } = parseSearchQuery(query);

    // Process system-level bang commands (!bm, !add, !note)
    if (
        trigger &&
        searchConfig.systemBangs.includes(trigger as (typeof searchConfig.systemBangs)[number])
    ) {
        // If user is not authenticated, redirect to login for all system commands
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

    // Regular search flow - process anonymous vs authenticated user
    if (!user) {
        return handleAnonymousSearch(
            req,
            res,
            query,
            triggerWithoutExclamationMark ?? '',
            searchTerm ?? '',
        );
    }

    // Process custom bang commands for authenticated users
    if (triggerWithoutExclamationMark) {
        // First check for any custom bangs defined by the user
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

    // Process system-defined bang commands - use the Map for faster lookups
    if (triggerWithoutExclamationMark) {
        // Use the Map for faster lookups instead of object property access
        const bang = bangsLookupMap.get(triggerWithoutExclamationMark);
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
    let searchUrl = defaultSearchProviders[defaultProvider].replace('{{{s}}}', encodeURIComponent(searchTerm)); // prettier-ignore

    // Handle unknown bang commands by searching for them without the "!"
    if (!searchTerm) {
        searchUrl = defaultSearchProviders[defaultProvider].replace('{{{s}}}', encodeURIComponent(triggerWithoutExclamationMark ?? '')); // prettier-ignore
    }

    return res.redirect(searchUrl);
}
