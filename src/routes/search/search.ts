import type { AppContext, AppContextContext, AppEnv, User } from '../../type.js';
import { renderView } from '../middleware.js';
import { Hono } from 'hono';

export function createSearchRouter(ctx: AppContext) {
    const router = new Hono<AppEnv>();

    router.post('/search', async (c: AppContextContext) => {
        const body = c.get('body');
        const query = body.q?.toString().trim() || '';
        const user = c.get('session').user as User;

        return (await ctx.utils.search.search({ c, user, query })) ?? c.body(null);
    });

    router.get('/search', ctx.middleware.authentication, async (c: AppContextContext) => {
        const user = c.get('user') as User;
        const query = c.req.query();
        const searchQuery = (typeof query.q === 'string' ? query.q : '').trim();
        const searchType = typeof query.type === 'string' ? query.type : 'global';

        if (!searchQuery) {
            return renderSearchResults(ctx, c, {
                title: 'Global Search',
                searchQuery: '',
                searchType,
                results: {
                    bookmarks: { data: [], pagination: {} },
                    actions: { data: [], pagination: {} },
                    notes: { data: [], pagination: {} },
                    tabs: [],
                    reminders: { data: [], pagination: {} },
                },
            });
        }

        if (searchType !== 'global') {
            return renderSearchResults(ctx, c, {
                title: 'Global Search',
                searchQuery,
                searchType,
                results: {
                    bookmarks: { data: [], pagination: {} },
                    actions: { data: [], pagination: {} },
                    notes: { data: [], pagination: {} },
                    tabs: [],
                    reminders: { data: [], pagination: {} },
                },
            });
        }

        const [bookmarksResult, actionsResult, notesResult, tabsResult, remindersResult] =
            await Promise.all([
                ctx.models.bookmarks.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    excludeHidden: true,
                    isLengthAware: false,
                }),

                ctx.models.actions.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    excludeHidden: true,
                    isLengthAware: false,
                }),

                ctx.models.notes.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    excludeHidden: true,
                    isLengthAware: false,
                }),

                ctx.models.tabs.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    isLengthAware: false,
                }),

                ctx.models.reminders.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    isLengthAware: false,
                }),
            ]);

        ctx.utils.html.applyHighlighting(bookmarksResult.data, ['title', 'url'], searchQuery);
        ctx.utils.html.applyHighlighting(
            actionsResult.data,
            ['name', 'trigger', 'url'],
            searchQuery,
        );
        ctx.utils.html.applyHighlighting(notesResult.data, ['title', 'content'], searchQuery);
        ctx.utils.html.applyHighlighting(remindersResult.data, ['title', 'content'], searchQuery);

        ctx.utils.html.applyHighlighting(tabsResult.data, ['title', 'trigger'], searchQuery);
        for (const tab of tabsResult.data) {
            if (tab.items) {
                ctx.utils.html.applyHighlighting(tab.items, ['title', 'url'], searchQuery);
            }
        }

        return renderSearchResults(ctx, c, {
            title: 'Global Search',
            searchQuery,
            searchType,
            results: {
                bookmarks: bookmarksResult,
                actions: actionsResult,
                notes: notesResult,
                tabs: tabsResult.data || [],
                reminders: remindersResult,
            },
        });
    });

    return router;
}

function renderSearchResults(
    ctx: AppContext,
    c: AppContextContext,
    options: Record<string, unknown>,
) {
    return renderView(ctx, c, 'search/search-results.html', {
        user: c.get('session')?.user,
        path: '/search',
        layout: '_layouts/auth.html',
        ...options,
    });
}
