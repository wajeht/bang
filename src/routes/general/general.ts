import {
    paginate,
    expectJson,
    extractPagination,
    highlightSearchTerm,
    getConvertedReadmeMDToHTML,
} from '../../utils/util';
import type { Knex } from 'knex';
import { bangs } from '../../db/bang';
import { search } from '../../utils/search';
import express, { type Request, type Response } from 'express';
import { authenticationMiddleware } from '../../routes/middleware';
import type { Bang, User, Actions, Bookmarks, Notes, Tabs, Reminders } from '../../type';

export function createGeneralRouter(
    db: Knex,
    actions: Actions,
    bookmarks: Bookmarks,
    notes: Notes,
    tabs: Tabs,
    reminders: Reminders,
) {
    const router = express.Router();

    router.get('/healthz', async (req: Request, res: Response) => {
        await db.raw('SELECT 1');

        if (expectJson(req)) {
            res.status(200).json({ status: 'ok', database: 'connected' });
            return;
        }

        res.setHeader('Content-Type', 'text/html').status(200).send('<p>ok</p>');
        return;
    });

    router.get('/', async (req: Request, res: Response) => {
        const query = req.query.q?.toString().trim() || '';
        const user = req.session.user as User | undefined;

        if (!query) {
            return res.render('general/home.html', {
                path: '/',
                title: 'Search',
            });
        }

        await search({ res, user, query, req });
    });

    router.get('/about', async (_req: Request, res: Response) => {
        return res.render('general/about.html', {
            path: '/about',
            title: 'About',
            howToContent: await getConvertedReadmeMDToHTML(),
        });
    });

    router.get('/privacy-policy', async (_req: Request, res: Response) => {
        return res.render('general/privacy-policy.html', {
            path: '/privacy-policy',
            title: 'Privacy Policy',
        });
    });

    router.get('/terms-of-service', async (_req: Request, res: Response) => {
        return res.render('general/terms-of-service.html', {
            path: '/terms-of-service',
            title: 'Terms of Service',
        });
    });

    router.get('/bangs', async (req: Request, res: Response) => {
        const {
            search: searchTerm = '',
            sort_key = 't',
            direction = 'asc',
            page = 1,
            per_page = 100,
        } = req.query;

        const bangsArray = Object.values(bangs as Record<string, Bang>);

        const filteredBangs = bangsArray.filter(
            (bang) =>
                bang.t.toLowerCase().includes(String(searchTerm).toLowerCase()) ||
                bang.s.toLowerCase().includes(String(searchTerm).toLowerCase()) ||
                bang.d.toLowerCase().includes(String(searchTerm).toLowerCase()),
        );

        const sortedBangs = filteredBangs.sort((a, b) => {
            const key = sort_key as keyof Bang;
            if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
            if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
            return 0;
        });

        const { data, ...pagination } = paginate(sortedBangs, {
            page: Number(page),
            perPage: Number(per_page),
            total: sortedBangs.length,
        });

        const highlightedData = searchTerm
            ? data.map((bang) => ({
                  ...bang,
                  s: highlightSearchTerm(bang.s, String(searchTerm)),
                  t: highlightSearchTerm(bang.t, String(searchTerm)),
                  d: highlightSearchTerm(bang.d, String(searchTerm)),
                  u: highlightSearchTerm(bang.u, String(searchTerm)),
                  c: highlightSearchTerm(bang.c, String(searchTerm)),
                  sc: highlightSearchTerm(bang.sc, String(searchTerm)),
              }))
            : data;

        return res.render('general/bangs-get.html', {
            layout: '_layouts/auth.html',
            howToContent: await getConvertedReadmeMDToHTML(),
            user: req.session.user,
            path: req.path,
            data: highlightedData,
            pagination,
            search: searchTerm,
            sortKey: sort_key,
            direction,
        });
    });

    /**
     * GET /api/collections
     *
     * @tags Collections
     * @summary Get all user collections (actions, bookmarks, and notes)
     *
     * @security BearerAuth
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     */
    router.get(
        '/api/collections',
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const actionsParams = extractPagination(req, 'actions');
            const bookmarksParams = extractPagination(req, 'bookmarks');
            const notesParams = extractPagination(req, 'notes');
            const tabsParams = extractPagination(req, 'tabs');
            const remindersParams = extractPagination(req, 'reminders');

            const [actionsResult, bookmarksResult, notesResult, tabsResult, remindersResult] =
                await Promise.all([
                    actions.all({
                        user,
                        perPage: actionsParams.perPage,
                        page: actionsParams.page,
                        search: actionsParams.search,
                        sortKey: actionsParams.sortKey,
                        direction: actionsParams.direction,
                    }),
                    bookmarks.all({
                        user,
                        perPage: bookmarksParams.perPage,
                        page: bookmarksParams.page,
                        search: bookmarksParams.search,
                        sortKey: bookmarksParams.sortKey,
                        direction: bookmarksParams.direction,
                    }),
                    notes.all({
                        user,
                        perPage: notesParams.perPage,
                        page: notesParams.page,
                        search: notesParams.search,
                        sortKey: notesParams.sortKey,
                        direction: notesParams.direction,
                    }),
                    tabs.all({
                        user,
                        perPage: tabsParams.perPage,
                        page: tabsParams.page,
                        search: tabsParams.search,
                        sortKey: tabsParams.sortKey,
                        direction: tabsParams.direction,
                    }),
                    reminders.all({
                        user,
                        perPage: remindersParams.perPage,
                        page: remindersParams.page,
                        search: remindersParams.search,
                        sortKey: remindersParams.sortKey,
                        direction: remindersParams.direction,
                    }),
                ]);

            res.json({
                actions: actionsResult,
                bookmarks: bookmarksResult,
                notes: notesResult,
                tabs: tabsResult,
                reminders: remindersResult,
                search: actionsParams.search, // or bookmarksParams.search, the same search for both
                sortKey: actionsParams.sortKey, // or bookmarksParams.sortKey, the same sortKey for both
                direction: actionsParams.direction, // or bookmarksParams.direction, the same direction for both
            });
            return;
        },
    );

    return router;
}
