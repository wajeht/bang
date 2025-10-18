import type { Request, Response } from 'express';
import type { AppContext, User } from '../../type';

export function SearchRouter(ctx: AppContext) {
    const router = ctx.libs.express.Router();

    router.post('/search', async (req: Request, res: Response) => {
        const query = req.body.q?.toString().trim() || '';
        const user = req.session.user as User;

        await ctx.utils.search.search({ res, user, query, req });
    });

    router.get('/search', ctx.middleware.authentication, async (req: Request, res: Response) => {
        const user = req.user as User;
        const searchQuery = req.query.q?.toString().trim() || '';
        const searchType = req.query.type?.toString() || 'global';

        if (!searchQuery) {
            return res.render('search/search-results.html', {
                user: req.session?.user,
                title: 'Global Search',
                path: '/search',
                layout: '_layouts/auth.html',
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
            return res.render('search/search-results.html', {
                user: req.session?.user,
                title: 'Global Search',
                path: '/search',
                layout: '_layouts/auth.html',
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
                    highlight: true,
                    excludeHidden: true,
                }),

                ctx.models.actions.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    highlight: true,
                    excludeHidden: true,
                }),

                ctx.models.notes.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    highlight: true,
                    excludeHidden: true,
                }),

                ctx.models.tabs.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    highlight: true,
                }),

                ctx.models.reminders.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    highlight: true,
                }),
            ]);

        if (ctx.utils.auth.isApiRequest(req)) {
            res.json({
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
            return;
        }

        return res.render('search/search-results.html', {
            user: req.session?.user,
            title: 'Global Search',
            path: '/search',
            layout: '_layouts/auth.html',
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
