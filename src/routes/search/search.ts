import type { Request, Response } from 'express';
import type { AppContext, User } from '../../type';

export function createSearchRouter(context: AppContext) {
    const router = context.libs.express.Router();

    router.post('/search', async (req: Request, res: Response) => {
        const query = req.body.q?.toString().trim() || '';
        const user = req.session.user as User;

        await context.utils.search.search({ res, user, query, req });
    });

    router.get(
        '/search',
        context.middleware.authentication,
        async (req: Request, res: Response) => {
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
                    context.models.bookmarks.all({
                        user,
                        perPage: 999999,
                        page: 1,
                        search: searchQuery,
                        sortKey: 'created_at',
                        direction: 'desc',
                        highlight: true,
                        excludeHidden: true,
                    }),

                    context.models.actions.all({
                        user,
                        perPage: 999999,
                        page: 1,
                        search: searchQuery,
                        sortKey: 'created_at',
                        direction: 'desc',
                        highlight: true,
                        excludeHidden: true,
                    }),

                    context.models.notes.all({
                        user,
                        perPage: 999999,
                        page: 1,
                        search: searchQuery,
                        sortKey: 'created_at',
                        direction: 'desc',
                        highlight: true,
                        excludeHidden: true,
                    }),

                    context.models.tabs.all({
                        user,
                        perPage: 999999,
                        page: 1,
                        search: searchQuery,
                        sortKey: 'created_at',
                        direction: 'desc',
                        highlight: true,
                    }),

                    context.models.reminders.all({
                        user,
                        perPage: 999999,
                        page: 1,
                        search: searchQuery,
                        sortKey: 'created_at',
                        direction: 'desc',
                        highlight: true,
                    }),
                ]);

            if (context.utils.auth.isApiRequest(req)) {
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
        },
    );

    return router;
}
