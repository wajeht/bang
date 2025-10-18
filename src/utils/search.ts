import { bangs as bangsTable } from '../db/bang';
import type { Request, Response } from 'express';
import type { Bang, Search, ReminderTimingResult, AppContext } from '../type';

export function createSearchUtils(context: AppContext) {
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
         * Maximum cumulative delay for anonymous users (in milliseconds)
         */
        maxCumulativeDelayMs: 60000,
        /**
         * Cache duration for redirects (in minutes)
         */
        redirectWithCacheDuration: 60,
        /**
         * System-level bang commands that cannot be overridden by user-defined bangs
         */
        systemBangs: new Set(['!add', '!bm', '!note', '!del', '!edit', '!find', '!remind']),
        /**
         * Default search providers
         */
        defaultSearchProviders: {
            duckduckgo: `https://duckduckgo.com/?q={{{s}}}`,
            google: `https://www.google.com/search?q={{{s}}}`,
            yahoo: `https://search.yahoo.com/search?p={{{s}}}`,
            bing: `https://www.bing.com/search?q={{{s}}}`,
        } as const,
        /**
         * Regular expressions for parsing search queries
         */
        regex: {
            /**
             * Regular expression for matching triggers
             */
            trigger: /^([!@]\S+)/,
            /**
             * Regular expression for matching domains
             */
            domain: /^[a-zA-Z0-9][\w.-]*\.[a-zA-Z]{2,}/,
            /**
             * Regular expression for matching whitespace
             */
            whitespace: /\s+/g,
        },
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
            ['@r', '/reminders'],
            ['@reminder', '/reminders'],
            ['@reminders', '/reminders'],
            ['@u', '/admin/users'],
            ['@user', '/admin/users'],
            ['@users', '/admin/users'],
        ]),
    } as const;

    /**
     * Reminder timing options configuration
     * Used by both the UI handlers and the parseReminderTiming function
     */
    const reminderTimingConfig = {
        /**
         * Recurring timing options
         */
        recurring: [
            { value: 'daily', text: 'Daily (recurring)' },
            { value: 'weekly', text: 'Weekly (recurring)' },
            { value: 'monthly', text: 'Monthly (recurring)' },
        ],
        /**
         * Custom date option
         */
        custom: [{ value: 'custom', text: 'Custom Date...' }],
        /**
         * Get all timing options combined for UI dropdowns
         */
        getAllOptions() {
            return [...this.recurring, ...this.custom];
        },
        /**
         * Get all supported timing values for validation
         */
        getAllValues() {
            return this.getAllOptions().map((option) => option.value);
        },
    } as const;

    function trackAnonymousUserSearch(req: Request) {
        req.session.searchCount = req.session.searchCount || 0;
        req.session.cumulativeDelay = req.session.cumulativeDelay || 0;

        req.session.searchCount += 1;

        // delay penalty if search limit is exceeded
        if (req.session.searchCount > searchConfig.searchLimit) {
            req.session.cumulativeDelay += searchConfig.delayIncrement;
            if (req.session.cumulativeDelay > searchConfig.maxCumulativeDelayMs) {
                req.session.cumulativeDelay = searchConfig.maxCumulativeDelayMs;
            }
        }
    }

    function redirectWithAlert(res: Response, url: string, message?: string) {
        const safeMessage = message ? context.utils.html.escapeHtml(message) : '';
        const safeUrl = context.utils.html.escapeHtml(url);

        return res.set({ 'Content-Type': 'text/html' }).status(200).send(`
			<script>
				${safeMessage ? `alert("${safeMessage}");` : ''}
				window.location.href = "${safeUrl}";
			</script>
		`);
    }

    function goBackWithValidationAlert(res: Response, message: string) {
        const safeMessage = context.utils.html.escapeHtml(message);

        return res.set({ 'Content-Type': 'text/html' }).status(422).send(`
			<script>
				alert("${safeMessage}");
				window.history.back();
			</script>
		`);
    }

    function goBack(res: Response) {
        return res.set({ 'Content-Type': 'text/html' }).status(200).send(`
			<script>
				window.history.back();
			</script>
		`);
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
    function parseSearchQuery(query: string): {
        /**
         * The type of command (bang or direct)
         * Used to determine how to process the query
         * @example "bang" for !g, !bm, etc.
         * @example "direct" for @notes, @bookmarks, etc.
         * @example null for regular searches without a command
         */
        commandType: 'bang' | 'direct' | null;

        /**
         * The full command trigger including prefix ("!" or "@")
         * Used for command identification and routing
         * @example "!g" for Google search
         * @example "!bm" for bookmark command
         * @example "@notes" for notes navigation
         * @example null for regular searches
         */
        trigger: string | null;

        /**
         * Command trigger with prefix removed
         * Used for looking up commands in bangs table or direct commands mapping
         * @example "g" for Google search
         * @example "bm" for bookmark command
         * @example "notes" for notes navigation
         * @example null for regular searches
         */
        triggerWithoutPrefix: string | null;

        /**
         * First valid URL found in the query string
         * Used for bookmark creation and custom bang definition
         * Supports both http and https protocols
         * Only relevant for bang commands, not direct commands
         * @example "https://example.com" from "!bm title https://example.com"
         * @example null when no URL is present
         */
        url: string | null;

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
        searchTerm: string;
    } {
        // empty/null queries
        if (!query?.trim()) {
            return {
                commandType: null,
                trigger: null,
                triggerWithoutPrefix: null,
                url: null,
                searchTerm: '',
            } as const;
        }

        const trimmed: string = query.trim();

        // queries without triggers
        const triggerMatch: RegExpMatchArray | null = trimmed.match(searchConfig.regex.trigger);
        if (!triggerMatch) {
            return {
                commandType: null,
                trigger: null,
                triggerWithoutPrefix: null,
                url: null,
                searchTerm: trimmed.replace(searchConfig.regex.whitespace, ' '),
            } as const;
        }

        const trigger: string = triggerMatch[0];
        const commandType: 'bang' | 'direct' = trigger[0] === '!' ? 'bang' : 'direct';
        const remaining: string = trimmed.slice(trigger.length).trim();

        // direct commands
        if (commandType === 'direct') {
            return {
                commandType,
                trigger,
                triggerWithoutPrefix: trigger.slice(1),
                url: null,
                searchTerm: remaining.replace(searchConfig.regex.whitespace, ' '),
            };
        }

        let url: string | null = null;
        let searchTerm: string = remaining;

        if (remaining) {
            let urlStart: number = -1;
            let urlEnd: number = -1;
            let foundUrl: string | null = null;

            // Look for protocol URLs first
            const httpIndex: number = remaining.indexOf('http://');
            const httpsIndex: number = remaining.indexOf('https://');

            if (httpIndex !== -1 || httpsIndex !== -1) {
                // Find the earliest protocol occurrence
                urlStart =
                    httpIndex === -1
                        ? httpsIndex
                        : httpsIndex === -1
                          ? httpIndex
                          : Math.min(httpIndex, httpsIndex);

                // Find the end of the URL (next space or end of string)
                urlEnd = remaining.indexOf(' ', urlStart);
                if (urlEnd === -1) urlEnd = remaining.length;

                foundUrl = remaining.slice(urlStart, urlEnd);

                // if it throws, foundUrl becomes null
                try {
                    new URL(foundUrl);
                } catch (error) {
                    context.logger.warn('Invalid URL found in query: %s', foundUrl, error);
                    foundUrl = null;
                }
            }

            // If no protocol URL found, look for domain-like patterns
            if (!foundUrl) {
                const tokens: string[] = remaining.split(' ');
                for (let i = 0; i < tokens.length; i++) {
                    const token: string = tokens[i] ?? '';
                    if (!token) continue;

                    // domain pattern check before expensive URL validation
                    if (searchConfig.regex.domain.test(token)) {
                        try {
                            new URL(`https://${token}`);
                            foundUrl = `https://${token}`;
                            // position for removal
                            const tokenStart: number = remaining.indexOf(token);
                            urlStart = tokenStart;
                            urlEnd = tokenStart + token.length;
                            break;
                        } catch (error) {
                            context.logger.warn(
                                'Invalid domain-like token in query: %s',
                                token,
                                error,
                            );
                            // next token
                        }
                    }
                }
            }

            if (foundUrl) {
                url = foundUrl;
                // remove URL from search term
                if (urlStart === 0) {
                    // at beginning
                    searchTerm = remaining.slice(urlEnd).trim();
                } else {
                    // in middle or end
                    const beforeUrl: string = remaining.slice(0, urlStart).trim();
                    const afterUrl: string = remaining.slice(urlEnd).trim();
                    searchTerm = beforeUrl + (beforeUrl && afterUrl ? ' ' : '') + afterUrl;
                }
            }
        }

        return {
            commandType,
            trigger,
            triggerWithoutPrefix: trigger.slice(1),
            url,
            searchTerm: searchTerm.replace(searchConfig.regex.whitespace, ' ').trim(),
        };
    }

    function getSearchLimitWarning(_req: Request, searchCount: number): string | null {
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

    async function processDelayedSearch(req: Request): Promise<void> {
        if (req.session.cumulativeDelay) {
            await new Promise((resolve) => setTimeout(resolve, req.session.cumulativeDelay));
        }
    }

    function redirectWithCache(
        res: Response,
        url: string,
        cacheDuration: number = searchConfig.redirectWithCacheDuration,
        cacheType: 'public' | 'private' | 'no-store' = 'private',
        varyHeaders?: string[],
    ): void {
        if (cacheType === 'no-store') {
            res.set({
                'Cache-Control': 'no-store',
            });
        } else {
            const headers: Record<string, string> = {
                'Cache-Control': `${cacheType}, max-age=${cacheDuration * 60}`,
                Expires: context.libs.dayjs().add(cacheDuration, 'minute').toDate().toUTCString(),
            };

            // Add Vary header to indicate cache should vary based on these headers
            if (varyHeaders && varyHeaders.length > 0) {
                headers['Vary'] = varyHeaders.join(', ');
            }

            res.set(headers);
        }
        res.redirect(url);
    }

    async function handleAnonymousSearch(
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
                searchConfig.defaultSearchProviders['duckduckgo'].replace(
                    '{{{s}}}',
                    encodeURIComponent(searchTerm),
                ),
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
                    redirectUrl = searchConfig.defaultSearchProviders['duckduckgo'].replace(
                        '{{{s}}}',
                        encodeURIComponent(query),
                    );
                }
            } else {
                redirectUrl = searchConfig.defaultSearchProviders['duckduckgo'].replace(
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
                    return redirectWithCache(
                        res,
                        getBangRedirectUrl(bang, searchTerm),
                        searchConfig.redirectWithCacheDuration,
                        'private',
                        ['Cookie'], // Vary by Cookie to handle user-specific results
                    );
                }

                // Handle bang-only queries (e.g., "!g") - redirects to service homepage
                if (context.utils.validation.isValidUrl(bang.u)) {
                    return redirectWithCache(
                        res,
                        getBangRedirectUrl(bang, ''),
                        searchConfig.redirectWithCacheDuration,
                        'public',
                    );
                }
            }
        }

        // Check if this is an unknown bang
        const parsedQuery = parseSearchQuery(query);
        const isUnknownBang =
            parsedQuery.commandType === 'bang' &&
            parsedQuery.triggerWithoutPrefix &&
            !searchConfig.bangs[parsedQuery.triggerWithoutPrefix];

        return redirectWithCache(
            res,
            searchConfig.defaultSearchProviders['duckduckgo'].replace(
                '{{{s}}}',
                encodeURIComponent(query),
            ),
            isUnknownBang ? 0 : searchConfig.redirectWithCacheDuration,
            isUnknownBang ? 'no-store' : 'private',
            isUnknownBang ? undefined : ['Cookie'],
        );
    }

    function getBangRedirectUrl(bang: Bang, searchTerm: string): string {
        let redirectUrl;
        if (searchTerm) {
            redirectUrl = bang.u.replace('{{{s}}}', encodeURIComponent(searchTerm));
        } else {
            // Handle Kagi bangs with relative URLs specially
            if (bang.d === 'kagi.com' && bang.u.startsWith('/')) {
                // For Kagi bangs with relative URLs, construct the full URL with empty search
                redirectUrl = `https://${bang.d}${bang.u.replace('{{{s}}}', '')}`;
            } else {
                redirectUrl = context.utils.util.ensureHttps(bang.d);
            }
        }

        // Handle case where redirect URL is empty or invalid - fallback to domain
        if (!redirectUrl || redirectUrl.trim() === '' || redirectUrl === 'https://') {
            redirectUrl = context.utils.util.ensureHttps(bang.d);
        }

        return redirectUrl;
    }

    /**
     * Parses reminder content into timing, description, and optional content
     * @param reminderContent - The full reminder content after "!remind "
     * @param user - User object with preferences
     * @returns Parsed reminder components
     */
    function parseReminderContent(
        reminderContent: string,
        user: { column_preferences?: { reminders?: { default_reminder_timing?: string } } },
    ): {
        when: string;
        description: string;
        content: string | null;
    } {
        const validTimingKeywords = ['daily', 'weekly', 'monthly'];
        const datePattern = /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}\/\d{4}|\w{3}-\d{1,2})$/;

        // Handle pipe-separated format: !remind [timing] description | content
        if (reminderContent.includes('|')) {
            const parts = reminderContent.split('|').map((part) => part.trim());
            const firstPart = parts[0] || '';

            // Check if first word is a timing keyword
            const firstWord = firstPart.split(' ')[0]?.toLowerCase() || '';
            const isValidTiming =
                validTimingKeywords.includes(firstWord) || datePattern.test(firstWord);

            if (isValidTiming) {
                const remainingFirstPart = firstPart.split(' ').slice(1).join(' ').trim();

                if (remainingFirstPart) {
                    // Format: !remind daily description | content
                    return {
                        when: firstWord,
                        description: remainingFirstPart,
                        content: parts[1] || null,
                    };
                } else {
                    // Format: !remind daily | description [| content]
                    return {
                        when: firstWord,
                        description: parts[1] || '',
                        content: parts.length > 2 ? parts[2] || null : null,
                    };
                }
            } else {
                // No timing keyword, use default timing
                return {
                    when: user.column_preferences?.reminders?.default_reminder_timing || 'daily',
                    description: firstPart,
                    content: parts[1] || null,
                };
            }
        }

        // Handle space-separated format with timing keyword: !remind daily description
        const words = reminderContent.split(' ');
        const firstWord = words[0]?.toLowerCase() || '';

        if (validTimingKeywords.includes(firstWord) || datePattern.test(firstWord)) {
            const remainingText = words.slice(1).join(' ');

            // Look for URLs with protocols or www prefix in the remaining text
            const urlMatch = remainingText.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);

            if (urlMatch) {
                const url = urlMatch[0];
                const urlStartIndex = remainingText.indexOf(url);
                const description = remainingText.slice(0, urlStartIndex).trim();

                if (!description) {
                    return {
                        when: firstWord,
                        description: 'Untitled',
                        content: url,
                    };
                }

                return {
                    when: firstWord,
                    description: description,
                    content: url,
                };
            }

            // Look for domain-like patterns (e.g., google.com)
            const remainingWords = words.slice(1);
            let urlIndex = -1;
            for (let i = 0; i < remainingWords.length; i++) {
                const word = remainingWords[i];
                if (word && context.utils.validation.isUrlLike(word)) {
                    urlIndex = i;
                    break;
                }
            }

            if (urlIndex !== -1) {
                const description = remainingWords.slice(0, urlIndex).join(' ');
                const url = remainingWords[urlIndex] || '';

                if (!description) {
                    return {
                        when: firstWord,
                        description: 'Untitled',
                        content: url,
                    };
                }

                return {
                    when: firstWord,
                    description: description,
                    content: url,
                };
            }

            return {
                when: firstWord,
                description: remainingText,
                content: null,
            };
        }

        // Handle URL-only input (for automatic title fetching)
        if (context.utils.validation.isUrlLike(reminderContent.trim())) {
            return {
                when: user.column_preferences?.reminders?.default_reminder_timing || 'daily',
                description: 'Untitled',
                content: reminderContent.trim(),
            };
        }

        // Look for URLs with protocols or www prefix in simple format
        const urlMatch = reminderContent.match(/(https?:\/\/[^\s]+|www\.[^\s]+)/i);

        if (urlMatch) {
            const url = urlMatch[0];
            const urlStartIndex = reminderContent.indexOf(url);
            const description = reminderContent.slice(0, urlStartIndex).trim();

            if (!description) {
                return {
                    when: user.column_preferences?.reminders?.default_reminder_timing || 'daily',
                    description: 'Untitled',
                    content: url,
                };
            }

            return {
                when: user.column_preferences?.reminders?.default_reminder_timing || 'daily',
                description: description,
                content: url,
            };
        }

        // Look for domain-like patterns in simple format
        const words2 = reminderContent.split(' ');
        let urlIndex = -1;
        for (let i = 0; i < words2.length; i++) {
            const word = words2[i];
            if (word && context.utils.validation.isUrlLike(word)) {
                urlIndex = i;
                break;
            }
        }

        if (urlIndex !== -1) {
            const description = words2.slice(0, urlIndex).join(' ');
            const url = words2[urlIndex] || '';

            // Single URL word - set up for title fetching
            if (!description && words2.length === 1) {
                return {
                    when: user.column_preferences?.reminders?.default_reminder_timing || 'daily',
                    description: 'Untitled',
                    content: url,
                };
            }

            if (!description) {
                return {
                    when: user.column_preferences?.reminders?.default_reminder_timing || 'daily',
                    description: 'Untitled',
                    content: url,
                };
            }

            return {
                when: user.column_preferences?.reminders?.default_reminder_timing || 'daily',
                description: description,
                content: url,
            };
        }

        return {
            when: user.column_preferences?.reminders?.default_reminder_timing || 'daily',
            description: reminderContent,
            content: null,
        };
    }

    /**
     * Parses reminder timing from natural language
     * @param timeStr - Time string like "daily", "weekly", "2024-01-15"
     * @param defaultTime - Default time in HH:MM format (e.g., "09:00")
     * @param userTimezone - User's timezone (e.g., "America/New_York")
     * @returns Parsed timing information with UTC dates
     */
    function parseReminderTiming(
        timeStr: string,
        defaultTime: string = '09:00',
        userTimezone: string = 'UTC',
    ): ReminderTimingResult {
        // Parse the default time (HH:MM format)
        const timeParts = defaultTime.split(':');
        const defaultHour = timeParts[0] ? parseInt(timeParts[0], 10) : 9;
        const defaultMinute = timeParts[1] ? parseInt(timeParts[1], 10) : 0;

        // Use timezone-aware dayjs for all date calculations
        const nowInUserTz = context.libs.dayjs.tz(undefined, userTimezone);

        // Handle recurring frequencies
        switch (timeStr) {
            case 'daily': {
                const dailyNext = nowInUserTz
                    .add(1, 'day')
                    .hour(defaultHour)
                    .minute(defaultMinute)
                    .second(0)
                    .millisecond(0);
                return {
                    isValid: true,
                    type: 'recurring',
                    frequency: 'daily',
                    specificDate: null,
                    nextDue: dailyNext.utc().toDate(),
                };
            }

            case 'weekly': {
                // Always schedule weekly reminders for Saturday
                let nextSaturday = nowInUserTz.day(6); // 6 = Saturday

                // If today is Saturday and we haven't passed the reminder time yet,
                // schedule for today. Otherwise, schedule for next Saturday.
                if (
                    nextSaturday.isBefore(nowInUserTz) ||
                    (nextSaturday.isSame(nowInUserTz, 'day') &&
                        nowInUserTz.hour() >= defaultHour &&
                        nowInUserTz.minute() > defaultMinute)
                ) {
                    nextSaturday = nextSaturday.add(1, 'week');
                }

                nextSaturday = nextSaturday
                    .hour(defaultHour)
                    .minute(defaultMinute)
                    .second(0)
                    .millisecond(0);

                return {
                    isValid: true,
                    type: 'recurring',
                    frequency: 'weekly',
                    specificDate: null,
                    nextDue: nextSaturday.utc().toDate(),
                };
            }

            case 'monthly': {
                // Always schedule monthly reminders for the 1st of the month
                let nextFirst = nowInUserTz.date(1);

                // If today is the 1st and we haven't passed the reminder time yet,
                // schedule for today. Otherwise, schedule for the 1st of next month.
                if (
                    nextFirst.isBefore(nowInUserTz) ||
                    (nextFirst.isSame(nowInUserTz, 'day') &&
                        nowInUserTz.hour() >= defaultHour &&
                        nowInUserTz.minute() > defaultMinute)
                ) {
                    nextFirst = nextFirst.add(1, 'month');
                }

                nextFirst = nextFirst
                    .hour(defaultHour)
                    .minute(defaultMinute)
                    .second(0)
                    .millisecond(0);

                return {
                    isValid: true,
                    type: 'recurring',
                    frequency: 'monthly',
                    specificDate: null,
                    nextDue: nextFirst.utc().toDate(),
                };
            }
        }

        // Handle specific dates (YYYY-MM-DD, MM/DD/YYYY, etc.)
        const datePatterns = [
            /^(\d{4})-(\d{1,2})-(\d{1,2})$/, // YYYY-MM-DD
            /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/, // MM/DD/YYYY
            /^(\w{3})-(\d{1,2})$/, // Jan-15, Feb-20, etc.
        ];

        for (const pattern of datePatterns) {
            const match = timeStr.match(pattern);
            if (match) {
                let targetDate: Date;

                if (pattern === datePatterns[0] && match[1] && match[2] && match[3]) {
                    // YYYY-MM-DD
                    targetDate = context.libs.dayjs
                        .tz(undefined, userTimezone)
                        .year(parseInt(match[1]))
                        .month(parseInt(match[2]) - 1)
                        .date(parseInt(match[3]))
                        .hour(defaultHour)
                        .minute(defaultMinute)
                        .second(0)
                        .millisecond(0)
                        .utc()
                        .toDate();
                } else if (pattern === datePatterns[1] && match[1] && match[2] && match[3]) {
                    // MM/DD/YYYY
                    targetDate = context.libs.dayjs
                        .tz(undefined, userTimezone)
                        .year(parseInt(match[3]))
                        .month(parseInt(match[1]) - 1)
                        .date(parseInt(match[2]))
                        .hour(defaultHour)
                        .minute(defaultMinute)
                        .second(0)
                        .millisecond(0)
                        .utc()
                        .toDate();
                } else if (pattern === datePatterns[2] && match[1] && match[2]) {
                    // Jan-15
                    const monthMap: { [key: string]: number } = {
                        jan: 0,
                        feb: 1,
                        mar: 2,
                        apr: 3,
                        may: 4,
                        jun: 5,
                        jul: 6,
                        aug: 7,
                        sep: 8,
                        oct: 9,
                        nov: 10,
                        dec: 11,
                    };
                    const month = monthMap[match[1].toLowerCase()];
                    if (month !== undefined && match[2]) {
                        let targetDayjs = nowInUserTz
                            .year(nowInUserTz.year())
                            .month(month)
                            .date(parseInt(match[2]))
                            .hour(defaultHour)
                            .minute(defaultMinute)
                            .second(0)
                            .millisecond(0);

                        // If the date has already passed this year, use next year
                        if (targetDayjs.isBefore(nowInUserTz)) {
                            targetDayjs = targetDayjs.add(1, 'year');
                        }
                        targetDate = targetDayjs.utc().toDate();
                    } else {
                        continue;
                    }
                } else {
                    continue;
                }

                // Validate the date
                if (
                    targetDate &&
                    !isNaN(targetDate.getTime()) &&
                    targetDate >=
                        nowInUserTz.year(nowInUserTz.year()).month(0).date(1).utc().toDate()
                ) {
                    return {
                        isValid: true,
                        type: 'once',
                        frequency: null,
                        specificDate: context.libs.dayjs
                            .tz(targetDate, 'UTC')
                            .tz(userTimezone)
                            .format('YYYY-MM-DD'),
                        nextDue: targetDate,
                    };
                }
            }
        }

        // Invalid format
        return {
            isValid: false,
            type: 'once',
            frequency: null,
            specificDate: null,
            nextDue: context.libs.dayjs().toDate(),
        };
    }

    async function search({ res, req, user, query }: Parameters<Search>[0]): ReturnType<Search> {
        const { commandType, trigger, triggerWithoutPrefix, url, searchTerm } =
            parseSearchQuery(query);

        if (!user?.id) {
            return handleAnonymousSearch(
                req,
                res,
                query,
                triggerWithoutPrefix ?? '',
                searchTerm ?? '',
            );
        }

        // Handle direct commands (@) - process these first since they're fast and common
        if (commandType === 'direct') {
            // For command-only queries like @notes, @bookmarks with no search term
            if (!searchTerm) {
                const directPath = searchConfig.directCommands.get(trigger ?? '');
                if (directPath) {
                    return redirectWithCache(
                        res,
                        directPath,
                        searchConfig.redirectWithCacheDuration,
                        'private',
                    );
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
                    case '@r':
                    case '@reminder':
                    case '@reminders':
                        redirectPath = `/reminders?search=${encodeURIComponent(searchTerm)}`;
                        break;
                    case '@u':
                    case '@user':
                    case '@users':
                        if (!user.is_admin) {
                            throw new context.errors.UnauthorizedError(
                                'You are not authorized to access this page',
                            );
                        }
                        redirectPath = `/admin/users?search=${encodeURIComponent(searchTerm)}`;
                        break;
                }

                if (redirectPath) {
                    return redirectWithCache(
                        res,
                        redirectPath,
                        searchConfig.redirectWithCacheDuration,
                        'private',
                    );
                }
            }
        }

        // Process system-level bang commands (!bm, !add, !note)
        if (trigger && commandType === 'bang' && searchConfig.systemBangs.has(trigger)) {
            // Process bookmark creation command (!bm)
            // Format supported:
            // 1. !bm URL [--hide]
            // Example: !bm https://example.com
            // Example: !bm https://example.com --hide
            if (trigger === '!bm') {
                if (!url || !context.utils.validation.isValidUrl(url)) {
                    return goBackWithValidationAlert(res, 'Invalid or missing URL');
                }

                let shouldHide = false;
                let titleSection: string | null = null;

                if (searchTerm) {
                    const hideIndex = searchTerm.indexOf('--hide');
                    if (hideIndex !== -1) {
                        shouldHide = true;
                        // Remove --hide from searchTerm to get the title
                        const beforeHide = searchTerm.slice(0, hideIndex).trim();
                        const afterHide = searchTerm.slice(hideIndex + 6).trim();
                        const cleanedTerm = (beforeHide + ' ' + afterHide).trim();

                        const urlIndex = cleanedTerm.indexOf(url);
                        titleSection =
                            urlIndex > -1 ? cleanedTerm.slice(0, urlIndex).trim() : cleanedTerm;
                    } else {
                        const urlIndex = searchTerm.indexOf(url);
                        titleSection =
                            urlIndex > -1 ? searchTerm.slice(0, urlIndex).trim() : searchTerm;
                    }
                }

                if (shouldHide) {
                    if (!user.hidden_items_password) {
                        return goBackWithValidationAlert(
                            res,
                            'You must set a global password in settings before hiding items',
                        );
                    }
                }

                try {
                    const existingBookmark = await context.utils.util.checkDuplicateBookmarkUrl(
                        user.id,
                        url,
                    );

                    if (existingBookmark) {
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

                    if (titleSection && titleSection.length > 255) {
                        return goBackWithValidationAlert(
                            res,
                            'Title must be shorter than 255 characters',
                        );
                    }

                    setTimeout(
                        () =>
                            context.utils.util.insertBookmark({
                                url,
                                title: titleSection || '',
                                userId: user.id,
                                hidden: shouldHide,
                            }),
                        0,
                    );

                    return redirectWithCache(
                        res,
                        url,
                        searchConfig.redirectWithCacheDuration,
                        'no-store',
                    );
                } catch (error) {
                    context.logger.error('Error adding bookmark:', error);
                    return goBackWithValidationAlert(
                        res,
                        'Failed to add bookmark. Please check the URL and try again.',
                    );
                }
            }

            // Process custom bang creation command (!add)
            // Format supported:
            // 1. !add !trigger URL [--hide]
            // 2. !add trigger URL [--hide]
            // Example: !add !custom https://custom-search.com
            // Example: !add custom https://custom-search.com --hide
            if (trigger === '!add') {
                let rest = query.slice('!add'.length).trim();

                let shouldHide = false;
                const hideIndex = rest.indexOf('--hide');
                if (hideIndex !== -1) {
                    shouldHide = true;
                    // Remove --hide from rest
                    rest = (rest.slice(0, hideIndex) + rest.slice(hideIndex + 6)).trim();
                }

                if (shouldHide) {
                    if (!user.hidden_items_password) {
                        return goBackWithValidationAlert(
                            res,
                            'You must set a global password in settings before hiding items',
                        );
                    }
                }

                const firstSpaceIdx = rest.indexOf(' ');
                if (firstSpaceIdx === -1) {
                    return goBackWithValidationAlert(res, 'Invalid trigger or empty URL');
                }

                const rawTrigger = rest.slice(0, firstSpaceIdx).trim();
                const bangUrl = rest.slice(firstSpaceIdx + 1).trim();

                if (!rawTrigger || !bangUrl) {
                    return goBackWithValidationAlert(res, 'Invalid trigger or empty URL');
                }

                const bangTrigger = context.utils.util.normalizeBangTrigger(rawTrigger);

                const hasSystemBangCommands = searchConfig.systemBangs.has(bangTrigger);

                let existingBang;
                try {
                    existingBang = await context
                        .db('bangs')
                        .where({ user_id: user.id, trigger: bangTrigger })
                        .first();
                } catch (error) {
                    context.logger.error('Database error checking existing bang:', error);
                    return goBackWithValidationAlert(
                        res,
                        'Database error occurred while checking bang',
                    );
                }

                const hasExistingCustomBangCommand = !!existingBang;

                if (hasExistingCustomBangCommand || hasSystemBangCommands) {
                    let message = `${bangTrigger} already exists. Please enter a new trigger:`;

                    if (hasSystemBangCommands) {
                        message = `${bangTrigger} is a bang's systems command. Please enter a new trigger:`;
                    }

                    if (
                        context.utils.validation.isOnlyLettersAndNumbers(bangTrigger.slice(1)) ===
                        false
                    ) {
                        message = `${bangTrigger} trigger can only contain letters and numbers. Please enter a new trigger:`;
                    }

                    const safeBangUrl = context.utils.html.escapeHtml(bangUrl);
                    const safeMessage = context.utils.html.escapeHtml(message);
                    const hideFlag = shouldHide ? ' --hide' : '';

                    return res.set({ 'Content-Type': 'text/html' }).status(422).send(`
                        <script>
                            const bangUrl = "${safeBangUrl}";
                            const newTrigger = prompt("${safeMessage}");
                            if (newTrigger) {
                                const domain = window.location.origin;
                                window.location.href = \`\${domain}/?q=!add \${newTrigger} \${bangUrl}${hideFlag}\`;
                            } else {
                                window.history.back();
                            }
                        </script>
                    `);
                }

                let bangs;
                try {
                    bangs = await context
                        .db('bangs')
                        .insert({
                            user_id: user.id,
                            trigger: bangTrigger,
                            name: 'Fetching title...',
                            action_type: 'redirect',
                            url: bangUrl,
                            hidden: shouldHide,
                        })
                        .returning('*');
                } catch (error) {
                    context.logger.error('Database error creating bang:', error);
                    return goBackWithValidationAlert(
                        res,
                        'Failed to create bang. Please try again.',
                    );
                }

                setTimeout(
                    () =>
                        context.utils.util.insertPageTitle({
                            actionId: bangs[0].id,
                            url: bangUrl,
                            req,
                        }),
                    0,
                );

                return goBack(res);
            }

            // Process delete bang command (!del)
            // Format supported:
            // 1. !del !trigger
            // Example: !del !custom
            if (trigger === '!del') {
                const bangToDelete =
                    searchTerm && searchTerm.length > 0
                        ? context.utils.util.normalizeBangTrigger(searchTerm)
                        : '';

                if (!bangToDelete || bangToDelete.length === 0) {
                    return goBackWithValidationAlert(res, 'Please specify a trigger to delete');
                }

                let deletedBangs = 0;
                let deletedTabs = 0;

                try {
                    deletedBangs = await context
                        .db('bangs')
                        .where({
                            user_id: user.id,
                            trigger: bangToDelete,
                        })
                        .delete();

                    deletedTabs = await context
                        .db('tabs')
                        .where({
                            user_id: user.id,
                            trigger: bangToDelete,
                        })
                        .delete();
                } catch (error) {
                    context.logger.error('Database error deleting bang/tab:', error);
                    return goBackWithValidationAlert(
                        res,
                        'Failed to delete bang. Please try again.',
                    );
                }

                if (deletedBangs === 0 && deletedTabs === 0) {
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
                const rest = query.slice('!edit'.length).trim();
                const tokens = rest.split(/\s+/); // normalize whitespace

                if (tokens.length < 2 || !tokens[0]) {
                    return goBackWithValidationAlert(
                        res,
                        'Invalid format. Use: !edit !trigger !newTrigger or !edit !trigger newUrl',
                    );
                }

                // Extract the old trigger, making sure it has the ! prefix
                const oldTrigger = context.utils.util.normalizeBangTrigger(tokens[0]);

                let existingBang;
                let existingTab;

                try {
                    existingBang = await context
                        .db('bangs')
                        .select('bangs.*')
                        .where({
                            'bangs.user_id': user.id,
                            'bangs.trigger': oldTrigger,
                        })
                        .first();

                    existingTab = await context
                        .db('tabs')
                        .select('tabs.*')
                        .where({
                            'tabs.user_id': user.id,
                            'tabs.trigger': oldTrigger,
                        })
                        .first();
                } catch (error) {
                    context.logger.error('Database error checking existing bang/tab:', error);
                    return goBackWithValidationAlert(
                        res,
                        'Database error occurred while checking bang',
                    );
                }

                if (
                    (!existingBang || typeof existingBang.id === 'undefined') &&
                    (!existingTab || typeof existingTab.id === 'undefined')
                ) {
                    return goBackWithValidationAlert(
                        res,
                        `${oldTrigger} not found or you don't have permission to edit it`,
                    );
                }

                const bangUpdates: Record<string, string> = {};
                const tabUpdates: Record<string, string> = {};

                // Handle new trigger (if provided and starts with !)
                if (tokens.length >= 2 && tokens[1] && tokens[1].startsWith('!')) {
                    const newTrigger = tokens[1];

                    if (searchConfig.systemBangs.has(newTrigger)) {
                        return goBackWithValidationAlert(
                            res,
                            `${newTrigger} is a system command and cannot be used as a trigger`,
                        );
                    }

                    // Check for conflicts in both bangs and tabs
                    let conflictingBang;
                    let conflictingTab;

                    try {
                        conflictingBang = await context
                            .db('bangs')
                            .where({
                                user_id: user.id,
                                trigger: newTrigger,
                            })
                            .whereNot(existingBang ? { id: existingBang.id } : {}) // Exclude the current bang if it exists
                            .first();

                        conflictingTab = await context
                            .db('tabs')
                            .where({
                                user_id: user.id,
                                trigger: newTrigger,
                            })
                            .whereNot(existingTab ? { id: existingTab.id } : {}) // Exclude the current tab if it exists
                            .first();
                    } catch (error) {
                        context.logger.error('Database error checking for conflicts:', error);
                        return goBackWithValidationAlert(
                            res,
                            'Database error occurred while checking conflicts',
                        );
                    }

                    if (conflictingBang || conflictingTab) {
                        return goBackWithValidationAlert(
                            res,
                            `${newTrigger} already exists. Please choose a different trigger`,
                        );
                    }

                    if (
                        context.utils.validation.isOnlyLettersAndNumbers(newTrigger.slice(1)) ===
                        false
                    ) {
                        return goBackWithValidationAlert(
                            res,
                            `${newTrigger} trigger can only contain letters and numbers`,
                        );
                    }

                    bangUpdates.trigger = newTrigger;
                    tabUpdates.trigger = newTrigger;

                    // URL is the third token if it exists (only for bangs)
                    if (tokens.length >= 3) {
                        const newUrl = tokens.slice(2).join(' ').trim();
                        if (newUrl && context.utils.validation.isValidUrl(newUrl)) {
                            bangUpdates.url = newUrl;
                        } else {
                            return goBackWithValidationAlert(res, 'Invalid URL format');
                        }
                    }
                } else {
                    // Only URL update (only for bangs)
                    const newUrl = tokens.slice(1).join(' ').trim();
                    if (newUrl && context.utils.validation.isValidUrl(newUrl)) {
                        bangUpdates.url = newUrl;
                    } else {
                        return goBackWithValidationAlert(res, 'Invalid URL format');
                    }
                }

                // Update bang if it exists and has updates
                if (existingBang && Object.keys(bangUpdates).length > 0) {
                    try {
                        await context
                            .db('bangs')
                            .where({ id: existingBang.id })
                            .update(bangUpdates);

                        if (bangUpdates.url) {
                            setTimeout(
                                () =>
                                    context.utils.util.insertPageTitle({
                                        actionId: existingBang.id,
                                        url: bangUpdates.url || ('' as string),
                                        req,
                                    }),
                                0,
                            );
                        }
                    } catch (error) {
                        context.logger.error('Database error updating bang:', error);
                        return goBackWithValidationAlert(
                            res,
                            'Failed to update bang. Please try again.',
                        );
                    }
                }

                // Update tab if it exists and has updates
                if (existingTab && Object.keys(tabUpdates).length > 0) {
                    try {
                        await context.db('tabs').where({ id: existingTab.id }).update(tabUpdates);
                    } catch (error) {
                        context.logger.error('Database error updating tab:', error);
                        return goBackWithValidationAlert(
                            res,
                            'Failed to update tab. Please try again.',
                        );
                    }
                }

                return goBack(res);
            }

            // Process note creation command (!note)
            // Formats supported:
            // 1. !note this is the title | this is the content [--hide]
            // 2. !note this is the content without title [--hide]
            // Example: !note this is the title | this is the content
            // Example: !note this is the content without title --hide
            if (trigger === '!note') {
                const contentStartIndex = query.indexOf(' ');

                // Only process content if the command has a space
                if (contentStartIndex === -1) {
                    return goBackWithValidationAlert(res, 'Content is required');
                }

                let fullContent = query.slice(contentStartIndex + 1).trim();

                if (!fullContent) {
                    return goBackWithValidationAlert(res, 'Content is required');
                }

                let shouldHide = false;
                const hideIndex = fullContent.indexOf('--hide');
                if (hideIndex !== -1) {
                    shouldHide = true;
                    // Remove --hide from content
                    fullContent = (
                        fullContent.slice(0, hideIndex) + fullContent.slice(hideIndex + 6)
                    ).trim();
                }

                if (shouldHide) {
                    if (!user.hidden_items_password) {
                        return goBackWithValidationAlert(
                            res,
                            'You must set a global password in settings before hiding items',
                        );
                    }
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
                    return goBackWithValidationAlert(
                        res,
                        'Title must be shorter than 255 characters',
                    );
                }

                try {
                    await context.db('notes').insert({
                        user_id: user.id,
                        title: title || 'Untitled',
                        content,
                        hidden: shouldHide,
                    });
                } catch (error) {
                    context.logger.error('Database error creating note:', error);
                    return goBackWithValidationAlert(
                        res,
                        'Failed to create note. Please try again.',
                    );
                }

                return goBack(res);
            }

            // Process tabs command (!tabs)
            // Format supported:
            // 1. !tabs
            // Example: !tabs
            if (trigger === '!tabs') {
                return res.redirect('/tabs/launch');
            }

            // Process global find command (!find)
            // Format supported:
            // 1. !find search_term
            // Example: !find javascript
            // Example: !find react hooks
            if (trigger === '!find') {
                if (!searchTerm || searchTerm.trim().length === 0) {
                    return goBackWithValidationAlert(
                        res,
                        'Please provide a search term for global search',
                    );
                }

                const encodedSearchTerm = encodeURIComponent(searchTerm.trim());

                // Redirect to a global search page that will search across all resources
                // The search page will handle querying bookmarks, notes, bangs, and tabs
                return redirectWithCache(
                    res,
                    `/search?q=${encodedSearchTerm}&type=global`,
                    searchConfig.redirectWithCacheDuration,
                    'private',
                );
            }

            // Process reminder creation command (!remind)
            // Formats supported:
            // 1. !remind <description> (uses user's default timing)
            // 2. !remind <when> <description> (when = daily, weekly, etc. or date)
            // 3. !remind <when> | <description> [| <content>] (pipe-separated)
            if (trigger === '!remind') {
                const spaceIndex = query.indexOf(' ');

                if (spaceIndex === -1) {
                    return goBackWithValidationAlert(res, 'Reminder content is required');
                }

                const reminderContent = query.slice(spaceIndex + 1).trim();

                if (!reminderContent) {
                    return goBackWithValidationAlert(res, 'Reminder content is required');
                }

                const { when, description, content } = parseReminderContent(reminderContent, user);

                if (!description) {
                    return goBackWithValidationAlert(res, 'Description is required');
                }

                // Parse the timing
                const defaultTime = user.column_preferences?.reminders?.default_reminder_time || '09:00'; // prettier-ignore
                const timing = parseReminderTiming(when.toLowerCase(), defaultTime, user.timezone || 'UTC'); // prettier-ignore

                if (!timing.isValid) {
                    return goBackWithValidationAlert(
                        res,
                        'Invalid time format. Use: daily, weekly, monthly, or YYYY-MM-DD',
                    );
                }

                try {
                    const [createdReminder] = await context
                        .db('reminders')
                        .insert({
                            user_id: user.id,
                            title: description,
                            content: content || null,
                            reminder_type: timing.type,
                            frequency: timing.frequency,
                            due_date:
                                timing.nextDue instanceof Date
                                    ? timing.nextDue.toISOString()
                                    : timing.nextDue,
                        })
                        .returning('id');

                    if (
                        description === 'Untitled' &&
                        content &&
                        context.utils.validation.isValidUrl(content)
                    ) {
                        setTimeout(
                            () =>
                                context.utils.util.insertPageTitle({
                                    reminderId: createdReminder.id,
                                    url: content,
                                    req,
                                }),
                            0,
                        );
                    }
                } catch (error) {
                    context.logger.error('Database error creating reminder:', error);
                    return goBackWithValidationAlert(
                        res,
                        'Failed to create reminder. Please try again.',
                    );
                }

                return goBack(res);
            }
        }

        // Process user-defined bang commands
        if (commandType === 'bang' && triggerWithoutPrefix) {
            let customBang;

            try {
                customBang = await context
                    .db('bangs')
                    .select('bangs.id', 'bangs.url', 'bangs.action_type', 'bangs.hidden')
                    .where({ 'bangs.user_id': user.id, 'bangs.trigger': trigger })
                    .first();
            } catch (error) {
                context.logger.error('Database error fetching custom bang:', error);
            }

            if (customBang) {
                setTimeout(
                    () =>
                        context.utils.util.updateUserBangLastReadAt({
                            userId: user.id,
                            bangId: customBang.id,
                        }),
                    0,
                );

                if (customBang.action_type === 'search') {
                    let url = customBang.url;
                    if (url.includes('{query}')) {
                        url = url.replace('{query}', encodeURIComponent(searchTerm ?? ''));
                    } else if (url.includes('{{{s}}}')) {
                        url = url.replace('{{{s}}}', encodeURIComponent(searchTerm ?? ''));
                    }

                    return redirectWithCache(
                        res,
                        url,
                        searchConfig.redirectWithCacheDuration,
                        'no-store', // Don't cache custom bang searches to avoid conflicts
                    );
                }

                if (customBang.action_type === 'redirect') {
                    if (customBang.hidden && user.hidden_items_password) {
                        const verificationKey = `bang_${customBang.id}`;
                        const verifiedTime = req.session?.verifiedHiddenItems?.[verificationKey];

                        if (!verifiedTime || verifiedTime < Date.now()) {
                            const safeUrl = context.utils.html.escapeHtml(customBang.url);
                            const csrfToken = res.locals.csrfToken || '';

                            return res.set({ 'Content-Type': 'text/html' }).status(200).send(`
                            <!DOCTYPE html>
                            <html>
                            <head><title>Password Required</title></head>
                            <body>
                            <script>
                                const password = prompt("This action is protected. Please enter your password:");
                                if (password) {
                                    const form = document.createElement('form');
                                    form.method = 'POST';
                                    form.action = '/verify-hidden-password';

                                    const csrfInput = document.createElement('input');
                                    csrfInput.type = 'hidden';
                                    csrfInput.name = 'csrfToken';
                                    csrfInput.value = '${csrfToken}';

                                    const passwordInput = document.createElement('input');
                                    passwordInput.type = 'hidden';
                                    passwordInput.name = 'password';
                                    passwordInput.value = password;

                                    const typeInput = document.createElement('input');
                                    typeInput.type = 'hidden';
                                    typeInput.name = 'resource_type';
                                    typeInput.value = 'bang';

                                    const idInput = document.createElement('input');
                                    idInput.type = 'hidden';
                                    idInput.name = 'resource_id';
                                    idInput.value = '${customBang.id}';

                                    const urlInput = document.createElement('input');
                                    urlInput.type = 'hidden';
                                    urlInput.name = 'redirect_url';
                                    urlInput.value = '${safeUrl}';

                                    const originalQueryInput = document.createElement('input');
                                    originalQueryInput.type = 'hidden';
                                    originalQueryInput.name = 'original_query';
                                    originalQueryInput.value = window.location.search;

                                    form.appendChild(csrfInput);
                                    form.appendChild(passwordInput);
                                    form.appendChild(typeInput);
                                    form.appendChild(idInput);
                                    form.appendChild(urlInput);
                                    form.appendChild(originalQueryInput);
                                    document.body.appendChild(form);
                                    form.submit();
                                } else {
                                    window.history.back();
                                }
                            </script>
                            </body>
                            </html>
                        `);
                        }
                    }

                    return redirectWithCache(
                        res,
                        customBang.url,
                        searchConfig.redirectWithCacheDuration,
                        'no-store', // Don't cache custom bang redirects to avoid conflicts
                    );
                }

                if (customBang.action_type === 'bookmark') {
                    return redirectWithCache(
                        res,
                        `/bookmarks#${customBang.id}`,
                        searchConfig.redirectWithCacheDuration,
                        'private',
                    );
                }
            }
        }

        let tab;

        try {
            tab = await context.db
                .select('*')
                .from('tabs')
                .where({ user_id: user.id, trigger })
                .first();
        } catch (error) {
            context.logger.error('Database error fetching tab:', error);
        }

        // Process tab commands
        if (tab) {
            return redirectWithCache(
                res,
                `/tabs/${tab.id}/launch`,
                searchConfig.redirectWithCacheDuration,
                'private',
                ['Cookie'], // Vary by Cookie for user-specific tabs
            );
        }

        // Process system-defined bang commands
        if (commandType === 'bang' && triggerWithoutPrefix) {
            const bang = searchConfig.bangs[triggerWithoutPrefix] as Bang;
            if (bang) {
                // Handle search queries with bang (e.g., "!g python")
                if (searchTerm) {
                    return redirectWithCache(
                        res,
                        getBangRedirectUrl(bang, searchTerm),
                        searchConfig.redirectWithCacheDuration,
                        'private',
                        ['Cookie'], // Vary by Cookie to handle user-specific results
                    );
                }

                // Handle bang-only queries (e.g., "!g") - redirects to service homepage
                if (context.utils.validation.isValidUrl(bang.u)) {
                    return redirectWithCache(
                        res,
                        getBangRedirectUrl(bang, ''),
                        searchConfig.redirectWithCacheDuration,
                        'public',
                    );
                }
            }
        }

        const defaultProvider = user.default_search_provider || 'duckduckgo';

        let searchUrl: string = searchConfig.defaultSearchProviders[
            defaultProvider as keyof typeof searchConfig.defaultSearchProviders
        ].replace('{{{s}}}', encodeURIComponent(searchTerm || query));

        // Handle unknown bang commands by searching for them without the "!"
        if (commandType === 'bang' && !searchTerm && triggerWithoutPrefix) {
            searchUrl = searchConfig.defaultSearchProviders[
                defaultProvider as keyof typeof searchConfig.defaultSearchProviders
            ].replace('{{{s}}}', encodeURIComponent(triggerWithoutPrefix));
        }

        // Check if this is an unknown bang that fell through (not in system bangs)
        const isUnknownBang =
            commandType === 'bang' &&
            !searchTerm &&
            triggerWithoutPrefix &&
            !searchConfig.bangs[triggerWithoutPrefix];

        return redirectWithCache(
            res,
            searchUrl,
            isUnknownBang ? 0 : searchConfig.redirectWithCacheDuration,
            isUnknownBang ? 'no-store' : 'private',
            isUnknownBang ? undefined : ['Cookie'],
        );
    }

    return {
        searchConfig,
        reminderTimingConfig,
        trackAnonymousUserSearch,
        redirectWithAlert,
        goBackWithValidationAlert,
        goBack,
        parseSearchQuery,
        getSearchLimitWarning,
        processDelayedSearch,
        redirectWithCache,
        handleAnonymousSearch,
        getBangRedirectUrl,
        parseReminderTiming,
        search,
    };
}
