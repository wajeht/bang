import type {
    Bookmark,
    AppContext,
    BookmarkToExport,
    PaginateArrayOptions,
    TurnstileVerifyResponse,
    ColumnPreferences,
} from '../type';
import http from 'node:http';
import https from 'node:https';
import type { Request } from 'express';

export function Utils(context: AppContext) {
    const { db, logger, config, errors } = context;

    const ACTION_TYPES = ['search', 'redirect'] as const;

    const DEFAULT_COLUMN_PREFERENCES: ColumnPreferences = {
        bookmarks: {
            title: true,
            url: true,
            default_per_page: 10,
            created_at: true,
            pinned: true,
            hidden: true,
        },
        actions: {
            name: true,
            trigger: true,
            url: true,
            action_type: true,
            default_per_page: 10,
            last_read_at: true,
            usage_count: true,
            created_at: true,
            hidden: true,
        },
        notes: {
            title: true,
            content: true,
            default_per_page: 10,
            created_at: true,
            pinned: true,
            view_type: 'table',
            hidden: true,
        },
        tabs: {
            title: true,
            trigger: true,
            items_count: true,
            default_per_page: 10,
            created_at: true,
        },
        reminders: {
            title: true,
            content: true,
            due_date: true,
            frequency: true,
            default_per_page: 10,
            created_at: true,
            default_reminder_timing: 'daily',
            default_reminder_time: '09:00',
        },
        users: {
            username: true,
            email: true,
            is_admin: true,
            default_per_page: 10,
            email_verified_at: true,
            created_at: true,
        },
    };

    return {
        ACTION_TYPES,

        parseColumnPreferences(raw: string | object | null | undefined): ColumnPreferences {
            let parsed: Partial<ColumnPreferences> = {};

            if (typeof raw === 'string') {
                try {
                    parsed = JSON.parse(raw);
                } catch {
                    parsed = {};
                }
            } else if (raw && typeof raw === 'object') {
                parsed = raw as Partial<ColumnPreferences>;
            }

            return {
                bookmarks: { ...DEFAULT_COLUMN_PREFERENCES.bookmarks, ...parsed.bookmarks },
                actions: { ...DEFAULT_COLUMN_PREFERENCES.actions, ...parsed.actions },
                notes: { ...DEFAULT_COLUMN_PREFERENCES.notes, ...parsed.notes },
                tabs: { ...DEFAULT_COLUMN_PREFERENCES.tabs, ...parsed.tabs },
                reminders: { ...DEFAULT_COLUMN_PREFERENCES.reminders, ...parsed.reminders },
                users: { ...DEFAULT_COLUMN_PREFERENCES.users, ...parsed.users },
            };
        },

        paginate<T>(array: T[], options: PaginateArrayOptions) {
            const { page, perPage, total } = options;
            const currentPage = Math.max(1, page);
            const offset = (currentPage - 1) * perPage;
            const data = array.slice(offset, offset + perPage);
            const lastPage = Math.ceil(total / perPage);

            return {
                data,
                total,
                perPage,
                currentPage,
                lastPage,
                from: offset + 1,
                to: offset + data.length,
                hasNext: currentPage < lastPage,
                hasPrev: currentPage > 1,
            };
        },

        normalizeBangTrigger(trigger: string): string {
            if (!trigger.length) {
                throw new errors.ValidationError({ trigger: 'Trigger cannot be empty' });
            }

            trigger = trigger.trim();

            if (trigger.startsWith('!')) {
                return trigger;
            }
            return `!${trigger}`;
        },

        ensureHttps(url: string): string {
            url = url.trim();

            if (url.length === 0) {
                throw new Error('Invalid input: URL cannot be empty');
            }

            if (url.toLowerCase().startsWith('https://')) {
                return url;
            }

            if (url.toLowerCase().startsWith('http://')) {
                url = url.substring(7);
            }

            url = url.replace(/^\/+/, '');

            return `https://${url}`;
        },

        capitalize(str: string): string {
            if (str === '') return '';

            if (str.length === 1) return str.toUpperCase();

            return str[0]?.toUpperCase() + str.substring(1);
        },

        truncateString(str: string, maxLength = 5) {
            if (!str) return '';

            if (str.length <= maxLength) {
                return str;
            }

            let truncated = str.slice(0, maxLength);

            // Remove trailing space if last char is space
            if (truncated[truncated.length - 1] === ' ') {
                truncated = truncated.slice(0, truncated.length - 1);
            }

            return truncated + '...';
        },

        getFaviconUrl(url: string): string {
            let domain = '';
            try {
                domain = new URL(url).hostname;
            } catch {
                domain = url;
            }
            return `https://favicon.jaw.dev/?url=${domain}`;
        },

        createBookmarkHtml(bookmark: BookmarkToExport): string {
            const escapedUrl = context.utils.html.escapeHtml(bookmark.url);
            const escapedTitle = context.utils.html.escapeHtml(bookmark.title);
            return `<DT><A HREF="${escapedUrl}" ADD_DATE="${bookmark.add_date}">${escapedTitle}</A>`;
        },

        createBookmarkDocument(bookmarks: BookmarkToExport[]): string {
            const header = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>`;

            const footer = '</DL><p>';

            const bookmarksHTML = bookmarks
                .map((bookmark) => this.createBookmarkHtml(bookmark))
                .join('\n');

            return `${header}\n${bookmarksHTML}\n${footer}`;
        },

        async fetchPageTitle(url: string): Promise<string> {
            try {
                new URL(url);
            } catch {
                return 'Untitled';
            }

            const client = url.startsWith('https') ? https : http;

            return new Promise<string>((resolve) => {
                const req = client.get(
                    url,
                    {
                        timeout: 5000,
                        headers: {
                            Accept: 'text/html',
                            'User-Agent':
                                'Mozilla/5.0 (compatible; Bang/1.0; +https://github.com/wajeht/bang)',
                        },
                    },
                    (res) => {
                        if (res.statusCode !== 200) {
                            req.destroy();
                            return resolve('Untitled');
                        }

                        let isTitleFound = false;
                        const titleRegex = /<title[^>]*>([^<]+)/i;

                        res.setEncoding('utf8');
                        res.on('data', (chunk) => {
                            if (!isTitleFound) {
                                const match = titleRegex.exec(chunk);
                                if (match && match[1]) {
                                    isTitleFound = true;
                                    resolve(match[1].slice(0, 100).trim());
                                    req.destroy();
                                }
                            }
                        });

                        res.on('end', () => {
                            if (!isTitleFound) resolve('Untitled');
                        });
                    },
                );

                req.on('error', () => resolve('Untitled'));
                req.end();
            });
        },

        async convertMarkdownToPlainText(
            markdownInput: string,
            maxLength?: number,
        ): Promise<string> {
            if (!markdownInput?.trim()) {
                return '';
            }

            try {
                const { marked } = await import('marked');
                const htmlOutput = await marked(markdownInput);
                let plainText = (htmlOutput as string).replace(/<(?!\/?mark\b)[^>]*>/g, '');
                plainText = plainText.replace(/\s+/g, ' ').trim();

                if (maxLength && plainText.length > maxLength) {
                    plainText = plainText.slice(0, maxLength).trim() + '...';
                }

                return plainText;
            } catch {
                return '';
            }
        },

        async updateUserBangLastReadAt({
            userId,
            bangId,
        }: {
            userId: number;
            bangId: number;
        }): Promise<void> {
            try {
                await db('bangs')
                    .where({ user_id: userId, id: bangId })
                    .update({
                        last_read_at: db.fn.now(),
                        usage_count: db.raw('usage_count + 1'),
                    });
            } catch (error) {
                logger.error('Error updating bang last read at', { error });
            }
        },

        async checkDuplicateBookmarkUrl(
            userId: number,
            url: string,
            title?: string,
        ): Promise<Bookmark | null> {
            try {
                if (title) {
                    return await db('bookmarks').where({ user_id: userId, url, title }).first();
                }
                return await db('bookmarks').where({ user_id: userId, url }).first();
            } catch (error) {
                logger.error('Error checking duplicate bookmark URL', { error, url });
                return null;
            }
        },

        async insertBookmark({
            url,
            userId,
            title,
            pinned,
            hidden,
            req,
        }: {
            url: string;
            userId: number;
            title?: string;
            pinned?: boolean;
            hidden?: boolean;
            req?: Request;
        }): Promise<void> {
            try {
                const [bookmark] = await db('bookmarks')
                    .insert({
                        user_id: userId,
                        url: url,
                        title: title || 'Fetching title...',
                        pinned: pinned || false,
                        hidden: hidden || false,
                    })
                    .returning('*');

                if (!title) {
                    void this.insertPageTitle({ bookmarkId: bookmark.id, url, req }).catch(
                        (error) => logger.error('Error inserting page title', { error, url }),
                    );
                }
            } catch (error) {
                logger.error('Error inserting bookmark', { error, url });
            }
        },

        async insertPageTitle({
            bookmarkId,
            actionId,
            reminderId,
            url,
            req,
        }: {
            bookmarkId?: number;
            actionId?: number;
            reminderId?: number;
            url: string;
            req?: Request;
        }): Promise<void> {
            const idCount = [bookmarkId, actionId, reminderId].filter(
                (id) => id !== undefined,
            ).length;
            if (idCount !== 1) {
                throw new errors.HttpError(
                    500,
                    'You must pass in exactly one id: either bookmarkId, actionId, or reminderId',
                    req,
                );
            }

            const title = await this.fetchPageTitle(url);

            if (bookmarkId) {
                try {
                    await db('bookmarks')
                        .where({ id: bookmarkId })
                        .update({ title, updated_at: db.fn.now() });
                } catch (error) {
                    logger.error('Error updating bookmark title', { error, bookmarkId });
                }
            }

            if (actionId) {
                try {
                    await db('bangs')
                        .where({ id: actionId })
                        .update({ name: title, updated_at: db.fn.now() });
                } catch (error) {
                    logger.error('Error updating action name', { error, actionId });
                }
            }

            if (reminderId) {
                try {
                    await db('reminders')
                        .where({ id: reminderId })
                        .update({ title, updated_at: db.fn.now() });
                } catch (error) {
                    logger.error('Error updating reminder title', { error, reminderId });
                }
            }
        },

        async sendNotification({ req, error }: { req: Request; error: Error }): Promise<void> {
            try {
                const n = await fetch(config.notify.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'X-API-KEY': config.notify.apiKey,
                    },
                    body: JSON.stringify({
                        message: `Error: ${error?.message}`,
                        details: JSON.stringify(
                            {
                                request: {
                                    method: req.method,
                                    url: req.url,
                                    headers: req.headers,
                                    query: req.query,
                                    body: req.body,
                                },
                                error: {
                                    name: error?.name,
                                    message: error?.message,
                                    stack: error?.stack,
                                    cause: error?.cause,
                                },
                                user: req.session?.user ?? req?.user,
                            },
                            null,
                            2,
                        ),
                    }),
                });

                if (!n.ok) {
                    const text = await n.text();
                    logger.error('Notification service error response', { status: n.status, text });
                }
            } catch (error) {
                logger.error('Failed to send error notification', { error });
            }
        },

        async generateUserDataExport(
            userId: number,
            options: {
                includeBookmarks?: boolean;
                includeActions?: boolean;
                includeNotes?: boolean;
                includeUserPreferences?: boolean;
                includeTabs?: boolean;
                includeReminders?: boolean;
            } = {},
        ): Promise<{
            exported_at: string;
            version: string;
            bookmarks?: Record<string, unknown>[];
            actions?: Record<string, unknown>[];
            notes?: Record<string, unknown>[];
            tabs?: Record<string, unknown>[];
            reminders?: Record<string, unknown>[];
            user_preferences?: Record<string, unknown>;
        }> {
            const {
                includeBookmarks = true,
                includeActions = true,
                includeNotes = true,
                includeUserPreferences = true,
                includeTabs = true,
                includeReminders = true,
            } = options;

            const exportData: {
                exported_at: string;
                version: string;
                bookmarks?: Record<string, unknown>[];
                actions?: Record<string, unknown>[];
                notes?: Record<string, unknown>[];
                tabs?: Record<string, unknown>[];
                reminders?: Record<string, unknown>[];
                user_preferences?: Record<string, unknown>;
            } = {
                exported_at: context.libs.dayjs().toISOString(),
                version: '1.0',
            };

            const fetchBookmarks = () =>
                includeBookmarks
                    ? db('bookmarks')
                          .where('user_id', userId)
                          .select('title', 'url', 'pinned', 'hidden', 'created_at')
                    : Promise.resolve([]);

            const fetchActions = () =>
                includeActions
                    ? db
                          .select(
                              'bangs.trigger',
                              'bangs.name',
                              'bangs.url',
                              'bangs.action_type',
                              'bangs.hidden',
                              'bangs.created_at',
                          )
                          .from('bangs')
                          .where('bangs.user_id', userId)
                    : Promise.resolve([]);

            const fetchNotes = () =>
                includeNotes
                    ? db('notes')
                          .where('user_id', userId)
                          .select('title', 'content', 'pinned', 'hidden', 'created_at')
                    : Promise.resolve([]);

            const fetchTabs = async () => {
                if (!includeTabs) return [];

                const tabs = await db('tabs')
                    .where('user_id', userId)
                    .select('id', 'trigger', 'title', 'created_at', 'updated_at')
                    .orderBy('created_at', 'asc');

                const tabIds = tabs.map((tab: any) => tab.id);

                if (tabIds.length === 0) {
                    return [];
                }

                const tabItems = await db('tab_items')
                    .whereIn('tab_id', tabIds)
                    .select('tab_id', 'title', 'url', 'created_at', 'updated_at')
                    .orderBy('created_at', 'asc');

                const itemsByTabId = tabItems.reduce(
                    (acc: any, item: any) => {
                        if (!acc[item.tab_id]) {
                            acc[item.tab_id] = [];
                        }
                        acc[item.tab_id].push({
                            title: item.title,
                            url: item.url,
                            created_at: item.created_at,
                            updated_at: item.updated_at,
                        });
                        return acc;
                    },
                    {} as Record<number, any[]>,
                );

                return tabs.map((tab: any) => ({
                    trigger: tab.trigger,
                    title: tab.title,
                    created_at: tab.created_at,
                    updated_at: tab.updated_at,
                    items: itemsByTabId[tab.id] || [],
                }));
            };

            const fetchReminders = () =>
                includeReminders
                    ? db('reminders')
                          .where('user_id', userId)
                          .select(
                              'title',
                              'content',
                              'reminder_type',
                              'frequency',
                              'due_date',
                              'created_at',
                          )
                    : Promise.resolve([]);

            const fetchUserPreferences = () =>
                includeUserPreferences
                    ? db('users')
                          .where('id', userId)
                          .select(
                              'username',
                              'default_search_provider',
                              'autocomplete_search_on_homepage',
                              'column_preferences',
                              'timezone',
                          )
                          .first()
                    : Promise.resolve(null);

            const [
                bookmarksResult,
                actionsResult,
                notesResult,
                userPreferencesResult,
                tabsResult,
                remindersResult,
            ] = await Promise.allSettled([
                fetchBookmarks(),
                fetchActions(),
                fetchNotes(),
                fetchUserPreferences(),
                fetchTabs(),
                fetchReminders(),
            ]);

            if (includeBookmarks) {
                if (bookmarksResult.status === 'fulfilled') {
                    exportData.bookmarks = bookmarksResult.value;
                } else {
                    logger.error('Failed to fetch bookmarks', { error: bookmarksResult.reason });
                }
            }

            if (includeActions) {
                if (actionsResult.status === 'fulfilled') {
                    exportData.actions = actionsResult.value;
                } else {
                    logger.error('Failed to fetch actions', { error: actionsResult.reason });
                }
            }

            if (includeNotes) {
                if (notesResult.status === 'fulfilled') {
                    exportData.notes = notesResult.value;
                } else {
                    logger.error('Failed to fetch notes', { error: notesResult.reason });
                }
            }

            if (includeUserPreferences) {
                if (userPreferencesResult.status === 'fulfilled' && userPreferencesResult.value) {
                    const userPrefs = userPreferencesResult.value;
                    if (typeof userPrefs.column_preferences === 'string') {
                        try {
                            userPrefs.column_preferences = JSON.parse(userPrefs.column_preferences);
                        } catch (error) {
                            logger.error('Failed to parse column_preferences', { error });
                            userPrefs.column_preferences = {};
                        }
                    }
                    exportData.user_preferences = userPrefs;
                } else if (userPreferencesResult.status === 'rejected') {
                    logger.error('Failed to fetch user preferences', {
                        error: userPreferencesResult.reason,
                    });
                }
            }

            if (includeTabs) {
                if (tabsResult.status === 'fulfilled') {
                    exportData.tabs = tabsResult.value;
                } else {
                    logger.error('Failed to fetch tabs', { error: tabsResult.reason });
                }
            }

            if (includeReminders) {
                if (remindersResult.status === 'fulfilled') {
                    exportData.reminders = remindersResult.value;
                } else {
                    logger.error('Failed to fetch reminders', { error: remindersResult.reason });
                }
            }

            return exportData;
        },

        async generateBookmarkHtmlExport(userId: number): Promise<string> {
            const bookmarks = (await db
                .select('url', 'title', db.raw("strftime('%s', created_at) as add_date"))
                .from('bookmarks')
                .where({ user_id: userId })) as BookmarkToExport[];

            return this.createBookmarkDocument(bookmarks);
        },

        async verifyTurnstileToken(
            token: string,
            remoteip?: string,
        ): Promise<TurnstileVerifyResponse> {
            const formData = new URLSearchParams();
            formData.append('secret', config.cloudflare.turnstileSecretKey);
            formData.append('response', token);
            if (remoteip) {
                formData.append('remoteip', remoteip);
            }

            try {
                const result = await fetch(
                    'https://challenges.cloudflare.com/turnstile/v0/siteverify',
                    {
                        method: 'POST',
                        body: formData,
                    },
                );

                const outcome = (await result.json()) as TurnstileVerifyResponse;

                if (!outcome.success) {
                    const errors = outcome['error-codes']?.join(', ') || 'Unknown error';
                    throw new Error(`Turnstile validation failed: ${errors}`);
                }

                return outcome;
            } catch (error) {
                throw new Error(`Failed to verify Turnstile token: ${(error as Error).message}`);
            }
        },

        async addToTabs(
            userId: number,
            tab_id: number,
            type: 'bookmarks' | 'bangs',
            id: number,
        ): Promise<void> {
            if (type !== 'bookmarks' && type !== 'bangs') {
                throw new errors.ValidationError({
                    type: 'Invalid type, must be either "bookmarks" or "bangs"',
                });
            }

            if (!id) {
                throw new errors.ValidationError({ id: 'Invalid id, must be a valid number' });
            }

            const tab = await db('tabs').where({ id: tab_id, user_id: userId }).first();

            if (!tab) {
                throw new errors.ValidationError({
                    tab_id: `Tab with ID ${tab_id} not found for user ${userId}`,
                });
            }

            const item = await db(type).where({ id, user_id: userId }).first();

            if (!item) {
                throw new errors.NotFoundError(`${type} not found`);
            }

            switch (type) {
                case 'bookmarks':
                    await db('tab_items').insert({
                        tab_id,
                        title: item.title,
                        url: item.url,
                    });
                    break;
                case 'bangs':
                    await db('tab_items').insert({
                        tab_id,
                        title: item.name,
                        url: item.url,
                    });
                    break;
                default:
                    throw new errors.ValidationError({
                        type: 'Invalid type, must be either "bookmarks" or "bangs"',
                    });
            }
        },
    };
}
