import { search } from '../utils/search';
import { isApiRequest } from '../utils/util';
import { authenticationMiddleware } from '../middleware';
import express, { type Request, type Response } from 'express';
import type { User, Actions, Bookmarks, Notes, Reminders, Tabs } from '../type';

export function createSearchRouter(
    actions: Actions,
    bookmarks: Bookmarks,
    notes: Notes,
    reminders: Reminders,
    tabs: Tabs,
) {
    const router = express.Router();

    router.post('/search', async (req: Request, res: Response) => {
        const query = req.body.q?.toString().trim() || '';
        const user = req.session.user as User;

        await search({ res, user, query, req });
    });

    router.get('/search', authenticationMiddleware, async (req: Request, res: Response) => {
        const user = req.user as User;
        const searchQuery = req.query.q?.toString().trim() || '';
        const searchType = req.query.type?.toString() || 'global';

        if (!searchQuery) {
            return res.render('./search/search-results.html', {
                user: req.session?.user,
                title: 'Global Search',
                path: '/search',
                layout: '../layouts/auth.html',
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
            return res.render('./search/search-results.html', {
                user: req.session?.user,
                title: 'Global Search',
                path: '/search',
                layout: '../layouts/auth.html',
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
                bookmarks.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    highlight: true,
                }),

                actions.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    highlight: true,
                }),

                notes.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    highlight: true,
                }),

                tabs.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    highlight: true,
                }),

                reminders.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    highlight: true,
                }),
            ]);

        if (isApiRequest(req)) {
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

        return res.render('./search/search-results.html', {
            user: req.session?.user,
            title: 'Global Search',
            path: '/search',
            layout: '../layouts/auth.html',
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
