import {
    addHttps,
    isValidUrl,
    insertBookmark,
    insertPageTitle,
    normalizeBangTrigger,
    isOnlyLettersAndNumbers,
    updateUserBangLastReadAt,
    checkDuplicateBookmarkUrl,
} from './util';
import { db } from '../db/db';
import { Bang, Search } from '../type';
import { Request, Response } from 'express';
import { defaultSearchProviders } from './util';
import { bangs as bangsTable } from '../db/bang';

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
     * Cache duration for redirects (in minutes)
     */
    redirectWithCacheDuration: 60,
    /**
     * System-level bang commands that cannot be overridden by user-defined bangs
     */
    systemBangs: new Set(['!add', '!bm', '!note', '!del', '!edit']),
    /**
     * Direct commands that can be used to navigate to different sections of the application
     */
    directCommands: new Map([
        ['@a', '/actions'],
        ['@action', '/actions'],
        ['@actions', '/actions'],
        ['@am', '/admin'],
        ['@admin', '/admin'],
        ['@api', '/api-docs'],
        ['@b', '/bangs'],
        ['@bang', '/bangs'],
        ['@bangs', '/bangs'],
        ['@bgh', 'https://github.com/wajeht/bang'],
        ['@bm', '/bookmarks'],
        ['@bookmark', '/bookmarks'],
        ['@bookmarks', '/bookmarks'],
        ['@d', '/settings/data'],
        ['@data', '/settings/data'],
        ['@s', '/settings'],
        ['@settings', '/settings'],
        ['@n', '/notes'],
        ['@note', '/notes'],
        ['@notes', '/notes'],
        ['@t', '/tabs'],
        ['@tab', '/tabs'],
        ['@tabs', '/tabs'],
    ]),
} as const;

export function trackAnonymousUserSearch(req: Request) {
    req.session.searchCount = req.session.searchCount || 0;
    req.session.cumulativeDelay = req.session.cumulativeDelay || 0;

    req.session.searchCount += 1;

    // delay penalty if search limit is exceeded
    if (req.session.searchCount > searchConfig.searchLimit) {
        req.session.cumulativeDelay += searchConfig.delayIncrement;
    }
}

export function redirectWithAlert(res: Response, url: string, message?: string) {
    return res.set({'Content-Type': 'text/html'})
		.status(200)
		.send(`
			<script>
				${message ? `alert("${message}");` : ''}
				window.location.href = "${url}";
			</script>
		`); // prettier-ignore
}

export function goBackWithValidationAlert(res: Response, message: string) {
    return res.set({'Content-Type': 'text/html'})
		.status(422)
		.send(`
			<script>
				alert("${message}");
				window.history.back();
			</script>
		`); // prettier-ignore
}

export function goBack(res: Response) {
    return res.set({'Content-Type': 'text/html'})
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
 * parseSearchQuery("!g python") → { commandType: "bang", trigger: "!g", triggerWithoutPrefix: "g", url: null, searchTerm: "python" }
 *
 * @example Direct command
 * parseSearchQuery("@notes search query") → { commandType: "direct", trigger: "@notes", triggerWithoutPrefix: "notes", url: null, searchTerm: "search query" }
 *
 * @example Bookmark with title
 * parseSearchQuery("!bm My Bookmark https://example.com") → { commandType: "bang", trigger: "!bm", triggerWithoutPrefix: "bm", url: "https://example.com", searchTerm: "My Bookmark" }
 *
 * @example Custom bang creation
 * parseSearchQuery("!add !custom https://custom-search.com") → { commandType: "bang", trigger: "!add", triggerWithoutPrefix: "add", url: "https://custom-search.com", searchTerm: "!custom" }
 */
export function parseSearchQuery(query: string) {
    const trimmed = (query || '').trim();
    if (!trimmed)
        return {
            commandType: null,
            trigger: null,
            triggerWithoutPrefix: null,
            url: null,
            searchTerm: '',
        };

    // Extract command trigger
    const triggerMatch = trimmed.match(/^([!@]\S+)/);
    if (!triggerMatch)
        return {
            commandType: null,
            trigger: null,
            triggerWithoutPrefix: null,
            url: null,
            searchTerm: trimmed.replace(/\s+/g, ' ').trim(),
        };

    const trigger = triggerMatch[0];
    const commandType = trigger.startsWith('!') ? 'bang' : 'direct';
    const remaining = trimmed.slice(trigger.length).trim();

    // URL extraction for bang commands only
    let url = null;
    let searchTerm = remaining;
    if (commandType === 'bang') {
        const urlMatch = remaining.match(/(?:^| )(https?:\/\/\S*)/);
        if (urlMatch) {
            url = urlMatch[1];
            searchTerm = remaining.replace(urlMatch[0], '').trim();
        }
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
        triggerWithoutPrefix: trigger.slice(1),

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
        searchTerm: searchTerm.replace(/\s+/g, ' ').trim(),
    };
}

export function getSearchLimitWarning(_req: Request, searchCount: number): string | null {
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

export async function processDelayedSearch(req: Request): Promise<void> {
    if (req.session.cumulativeDelay) {
        await new Promise((resolve) => setTimeout(resolve, req.session.cumulativeDelay));
    }
}

export function redirectWithCache(
    res: Response,
    url: string,
    cacheDuration: number = searchConfig.redirectWithCacheDuration,
): void {
    res.set({
        'Cache-Control': `public, max-age=${cacheDuration * 60}`,
        Expires: new Date(Date.now() + cacheDuration * 60 * 1000).toUTCString(),
    });
    res.redirect(url);
}

export async function handleAnonymousSearch(
    req: Request,
    res: Response,
    query: string,
    triggerWithoutBang: string,
    searchTerm: string,
): Promise<Response | void> {
    const warningMessage = getSearchLimitWarning(req, req.session.searchCount ?? 0);

    if (warningMessage) {
        trackAnonymousUserSearch(req);
        return redirectWithAlert(
            res,
            defaultSearchProviders['duckduckgo'].replace('{{{s}}}', encodeURIComponent(searchTerm)),
            warningMessage,
        );
    }

    trackAnonymousUserSearch(req);

    if (req.session.cumulativeDelay) {
        const delayPromise = processDelayedSearch(req);

        let redirectUrl = '';
        const message = `This search was delayed by ${req.session.cumulativeDelay / 1000} seconds due to rate limiting.`;

        if (triggerWithoutBang) {
            const bang = searchConfig.bangs[triggerWithoutBang] as Bang;
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

        await delayPromise;

        return redirectWithAlert(res, redirectUrl, message);
    }

    if (triggerWithoutBang) {
        const bang = searchConfig.bangs[triggerWithoutBang] as Bang;
        if (bang) {
            // Handle search queries with bang (e.g., "!g python")
            if (searchTerm) {
                return redirectWithCache(res, getBangRedirectUrl(bang, searchTerm));
            }

            // Handle bang-only queries (e.g., "!g") - redirects to service homepage
            if (isValidUrl(bang.u)) {
                return redirectWithCache(res, getBangRedirectUrl(bang, ''));
            }
        }
    }

    return redirectWithCache(
        res,
        defaultSearchProviders['duckduckgo'].replace('{{{s}}}', encodeURIComponent(query)),
    );
}

export function getBangRedirectUrl(bang: Bang, searchTerm: string): string {
    let redirectUrl;
    if (searchTerm) {
        redirectUrl = bang.u.replace('{{{s}}}', encodeURIComponent(searchTerm));
    } else {
        redirectUrl = addHttps(bang.d);
    }

    return redirectUrl;
}

export async function search({ res, req, user, query }: Parameters<Search>[0]): ReturnType<Search> {
    const { commandType, trigger, triggerWithoutPrefix, url, searchTerm } = parseSearchQuery(query);

    if (!user?.id) {
        return handleAnonymousSearch(req, res, query, triggerWithoutPrefix ?? '', searchTerm ?? '');
    }

    // Handle direct commands (@) - process these first since they're fast and common
    if (commandType === 'direct') {
        // For command-only queries like @notes, @bookmarks with no search term
        if (!searchTerm) {
            const directPath = searchConfig.directCommands.get(trigger);
            if (directPath) {
                return redirectWithCache(res, directPath);
            }
        }

        // For commands with search terms like @notes search query
        if (searchTerm && trigger) {
            let redirectPath: string | null = null;

            switch (trigger) {
                case '@n':
                case '@note':
                case '@notes':
                    redirectPath = `/notes?search=${encodeURIComponent(searchTerm)}`;
                    break;
                case '@b':
                case '@bang':
                case '@bangs':
                    redirectPath = `/bangs?search=${encodeURIComponent(searchTerm)}`;
                    break;
                case '@bm':
                case '@bookmark':
                case '@bookmarks':
                    redirectPath = `/bookmarks?search=${encodeURIComponent(searchTerm)}`;
                    break;
                case '@a':
                case '@action':
                case '@actions':
                    redirectPath = `/actions?search=${encodeURIComponent(searchTerm)}`;
                    break;
                case '@t':
                case '@tab':
                case '@tabs':
                    redirectPath = `/tabs?search=${encodeURIComponent(searchTerm)}`;
                    break;
            }

            if (redirectPath) {
                return redirectWithCache(res, redirectPath);
            }
        }
    }

    // Process system-level bang commands (!bm, !add, !note)
    if (trigger && commandType === 'bang' && searchConfig.systemBangs.has(trigger)) {
        // Process bookmark creation command (!bm)
        // Format supported:
        // 1. !bm URL
        // Example: !bm https://example.com
        if (trigger === '!bm') {
            if (!url || !isValidUrl(url)) {
                return goBackWithValidationAlert(res, 'Invalid or missing URL');
            }

            try {
                const existingBookmark = await checkDuplicateBookmarkUrl(user.id, url);

                if (existingBookmark) {
                    // Extract title from command by removing "!bm" and URL
                    let titleSection: string | null = null;
                    if (searchTerm) {
                        const urlIndex = searchTerm.indexOf(url);
                        titleSection =
                            urlIndex > -1 ? searchTerm.slice(0, urlIndex).trim() : searchTerm;
                    }

                    const newTitle = titleSection || '';

                    if (newTitle.length > 0) {
                        return goBackWithValidationAlert(
                            res,
                            `URL already bookmarked as ${existingBookmark.title}. Use a different URL or update the existing bookmark.`,
                        );
                    }

                    return goBackWithValidationAlert(
                        res,
                        `URL already bookmarked as ${existingBookmark.title}. Bookmark already exists.`,
                    );
                }

                // Extract title from command by removing "!bm" and URL - optimized to avoid redundant operations
                let titleSection: string | null = null;

                if (searchTerm) {
                    const urlIndex = searchTerm.indexOf(url);
                    titleSection =
                        urlIndex > -1 ? searchTerm.slice(0, urlIndex).trim() : searchTerm;
                }

                if (titleSection && titleSection.length > 255) {
                    return goBackWithValidationAlert(
                        res,
                        'Title must be shorter than 255 characters',
                    );
                }

                setTimeout(
                    () =>
                        insertBookmark({
                            url,
                            title: titleSection || '',
                            userId: user.id,
                        }),
                    0,
                );

                return redirectWithCache(res, url);
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
            const [, rawTrigger, bangUrl] = query.split(' ');

            if (!rawTrigger || !bangUrl?.length) {
                return goBackWithValidationAlert(res, 'Invalid trigger or empty URL');
            }

            const bangTrigger = normalizeBangTrigger(rawTrigger);

            const hasSystemBangCommands = searchConfig.systemBangs.has(bangTrigger);

            const existingBang = await db('bangs')
                .where({ user_id: user.id, trigger: bangTrigger })
                .first();

            const hasExistingCustomBangCommand = !!existingBang;

            if (hasExistingCustomBangCommand || hasSystemBangCommands) {
                let message = `${bangTrigger} already exists. Please enter a new trigger:`;

                if (hasSystemBangCommands) {
                    message = `${bangTrigger} is a bang's systems command. Please enter a new trigger:`;
                }

                if (isOnlyLettersAndNumbers(bangTrigger.slice(1)) === false) {
                    message = `${bangTrigger} trigger can only contain letters and numbers. Please enter a new trigger:`;
                }

                return res
                    .set({'Content-Type': 'text/html'})
                    .status(422)
                    .send(`
                        <script>
                            const bangUrl = "${bangUrl}";
                            const newTrigger = prompt("${message}");
                            if (newTrigger) {
                                const domain = window.location.origin;
                                window.location.href = \`\${domain}/?q=!add \${newTrigger} \${bangUrl}\`;
                            } else {
                                window.history.back();
                            }
                        </script>
                    `); // prettier-ignore
            }

            const bangs = await db('bangs')
                .insert({
                    user_id: user.id,
                    trigger: bangTrigger,
                    name: 'Fetching title...',
                    action_type_id: 2, // redirect
                    url: bangUrl,
                })
                .returning('*');

            setTimeout(() => insertPageTitle({ actionId: bangs[0].id, url: bangUrl, req }), 0);

            return goBack(res);
        }

        // Process delete bang command (!del)
        // Format supported:
        // 1. !del !trigger
        // Example: !del !custom
        if (trigger === '!del') {
            const bangToDelete =
                searchTerm && searchTerm.length > 0 ? normalizeBangTrigger(searchTerm) : '';

            if (!bangToDelete || bangToDelete.length === 0) {
                return goBackWithValidationAlert(res, 'Please specify a trigger to delete');
            }

            const deletedCount = await db('bangs')
                .where({
                    user_id: user.id,
                    trigger: bangToDelete,
                })
                .delete();

            if (deletedCount === 0) {
                return goBackWithValidationAlert(
                    res,
                    `Bang '${bangToDelete}' not found or you don't have permission to delete it`,
                );
            }

            return goBack(res);
        }

        // Process edit bang command (!edit)
        // Format supported:
        // 1. !edit !oldTrigger !newTrigger (change trigger only)
        // 2. !edit !oldTrigger url (change URL only)
        // 3. !edit !oldTrigger !newTrigger url (change both)
        // Example: !edit !old !new https://example.com
        if (trigger === '!edit') {
            const parts = query.split(' ').slice(1); // Remove the !edit part

            if (parts.length < 2) {
                return goBackWithValidationAlert(
                    res,
                    'Invalid format. Use: !edit !trigger !newTrigger or !edit !trigger newUrl',
                );
            }

            if (!parts[0]) {
                return goBackWithValidationAlert(
                    res,
                    'Invalid format. Use: !edit !trigger !newTrigger or !edit !trigger newUrl',
                );
            }

            // Extract the old trigger, making sure it has the ! prefix
            const oldTrigger = normalizeBangTrigger(parts[0]);

            const existingBang = await db('bangs')
                .select('bangs.*')
                .where({
                    'bangs.user_id': user.id,
                    'bangs.trigger': oldTrigger,
                })
                .first();

            if (!existingBang || typeof existingBang.id === 'undefined') {
                return goBackWithValidationAlert(
                    res,
                    `Bang ${oldTrigger} not found or you don't have permission to edit it`,
                );
            }

            const updates: Record<string, string> = {};

            // Handle new trigger (if provided and starts with !)
            if (parts.length >= 2 && parts[1] && parts[1].startsWith('!')) {
                const newTrigger = parts[1];

                if (searchConfig.systemBangs.has(newTrigger)) {
                    return goBackWithValidationAlert(
                        res,
                        `${newTrigger} is a system command and cannot be used as a trigger`,
                    );
                }

                const conflictingBang = await db('bangs')
                    .where({
                        user_id: user.id,
                        trigger: newTrigger,
                    })
                    .whereNot({ id: existingBang.id }) // Exclude the current bang
                    .first();

                if (conflictingBang) {
                    return goBackWithValidationAlert(
                        res,
                        `${newTrigger} already exists. Please choose a different trigger`,
                    );
                }

                if (isOnlyLettersAndNumbers(newTrigger.slice(1)) === false) {
                    return goBackWithValidationAlert(
                        res,
                        `${newTrigger} trigger can only contain letters and numbers`,
                    );
                }

                updates.trigger = newTrigger;

                // URL is the third part if it exists
                if (parts.length >= 3) {
                    const newUrl = parts[2];
                    if (newUrl && isValidUrl(newUrl)) {
                        updates.url = newUrl;
                    } else {
                        return goBackWithValidationAlert(res, 'Invalid URL format');
                    }
                }
            } else {
                const newUrl = parts[1];
                if (newUrl && isValidUrl(newUrl)) {
                    updates.url = newUrl;
                } else {
                    return goBackWithValidationAlert(res, 'Invalid URL format');
                }
            }

            await db('bangs').where({ id: existingBang.id }).update(updates);

            if (updates.url) {
                setTimeout(
                    () =>
                        insertPageTitle({
                            actionId: existingBang.id,
                            url: updates.url || ('' as string),
                            req,
                        }),
                    0,
                );
            }

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

            // Only process content if the command has a space
            if (contentStartIndex === -1) {
                return goBackWithValidationAlert(res, 'Content is required');
            }

            const fullContent = query.slice(contentStartIndex + 1).trim();

            if (!fullContent) {
                return goBackWithValidationAlert(res, 'Content is required');
            }

            // If content contains a pipe, split into title and content
            const pipeIndex = fullContent.indexOf('|');
            const hasPipe = pipeIndex !== -1;
            let title = '';
            let content = fullContent;

            if (hasPipe) {
                title = fullContent.slice(0, pipeIndex).trim();
                content = fullContent.slice(pipeIndex + 1).trim();

                if (!content) {
                    return goBackWithValidationAlert(res, 'Content is required');
                }
            }

            if (title.length > 255) {
                return goBackWithValidationAlert(res, 'Title must be shorter than 255 characters');
            }

            await db('notes').insert({
                user_id: user.id,
                title: title || 'Untitled',
                content,
            });

            return goBack(res);
        }

        // Process tabs command (!tabs)
        // Format supported:
        // 1. !tabs
        // Example: !tabs
        if (trigger === '!tabs') {
            return res.redirect('/tabs/launch');
        }
    }

    // Process user-defined bang commands
    if (commandType === 'bang' && triggerWithoutPrefix) {
        const customBang = await db('bangs')
            .select('bangs.id', 'bangs.url', 'action_types.name as action_type')
            .where({ 'bangs.user_id': user.id, 'bangs.trigger': trigger })
            .join('action_types', 'bangs.action_type_id', 'action_types.id')
            .first();

        if (customBang) {
            setTimeout(
                () => updateUserBangLastReadAt({ userId: user.id, bangId: customBang.id }),
                0,
            );

            if (customBang.action_type === 'search') {
                let url = customBang.url;
                if (url.includes('{query}')) {
                    url = url.replace('{query}', encodeURIComponent(searchTerm ?? ''));
                } else if (url.includes('{{{s}}}')) {
                    url = url.replace('{{{s}}}', encodeURIComponent(searchTerm ?? ''));
                }

                return redirectWithCache(res, url);
            }

            if (customBang.action_type === 'redirect') {
                return redirectWithCache(res, customBang.url);
            }

            if (customBang.action_type === 'bookmark') {
                return redirectWithCache(res, `/bookmarks#${customBang.id}`);
            }
        }
    }

    const tab = await db.select('*').from('tabs').where({ user_id: user.id, trigger }).first();

    // Process tab commands
    if (tab) {
        return redirectWithCache(res, `/tabs/${tab.id}/launch`);
    }

    // Process system-defined bang commands
    if (commandType === 'bang' && triggerWithoutPrefix) {
        const bang = searchConfig.bangs[triggerWithoutPrefix] as Bang;
        if (bang) {
            // Handle search queries with bang (e.g., "!g python")
            if (searchTerm) {
                return redirectWithCache(res, getBangRedirectUrl(bang, searchTerm));
            }

            // Handle bang-only queries (e.g., "!g") - redirects to service homepage
            if (isValidUrl(bang.u)) {
                return redirectWithCache(res, getBangRedirectUrl(bang, ''));
            }
        }
    }

    const defaultProvider = user.default_search_provider || 'duckduckgo';

    let searchUrl: string = defaultSearchProviders[defaultProvider as keyof typeof defaultSearchProviders].replace('{{{s}}}', encodeURIComponent(searchTerm || query)); // prettier-ignore

    // Handle unknown bang commands by searching for them without the "!"
    if (commandType === 'bang' && !searchTerm && triggerWithoutPrefix) {
        searchUrl = defaultSearchProviders[defaultProvider as keyof typeof defaultSearchProviders].replace('{{{s}}}', encodeURIComponent(triggerWithoutPrefix)); // prettier-ignore
    }

    return redirectWithCache(res, searchUrl);
}
