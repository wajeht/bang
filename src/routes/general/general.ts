import { bangs } from '../../db/bang';
import type { Request, Response } from 'express';
import type { Bang, User, AppContext } from '../../type';

export function GeneralRouter(context: AppContext) {
    const router = context.libs.express.Router();

    router.get('/healthz', async (req: Request, res: Response) => {
        await context.db.raw('SELECT 1');

        if (context.utils.auth.expectsJson(req)) {
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

        await context.utils.search.search({ res, user, query, req });
    });

    router.get('/about', async (_req: Request, res: Response) => {
        return res.render('general/about.html', {
            path: '/about',
            title: 'About',
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

        const { data, ...pagination } = context.utils.util.paginate(sortedBangs, {
            page: Number(page),
            perPage: Number(per_page),
            total: sortedBangs.length,
        });

        const highlightedData = searchTerm
            ? data.map((bang: Bang) => ({
                  ...bang,
                  s: context.utils.html.highlightSearchTerm(bang.s, String(searchTerm)),
                  t: context.utils.html.highlightSearchTerm(bang.t, String(searchTerm)),
                  d: context.utils.html.highlightSearchTerm(bang.d, String(searchTerm)),
                  u: context.utils.html.highlightSearchTerm(bang.u, String(searchTerm)),
                  c: context.utils.html.highlightSearchTerm(bang.c, String(searchTerm)),
                  sc: context.utils.html.highlightSearchTerm(bang.sc, String(searchTerm)),
              }))
            : data;

        return res.render('general/bangs-get.html', {
            layout: '_layouts/auth.html',
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
        context.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const actionsParams = context.utils.request.extractPaginationParams(req, 'actions');
            const bookmarksParams = context.utils.request.extractPaginationParams(req, 'bookmarks');
            const notesParams = context.utils.request.extractPaginationParams(req, 'notes');
            const tabsParams = context.utils.request.extractPaginationParams(req, 'tabs');
            const remindersParams = context.utils.request.extractPaginationParams(req, 'reminders');

            const [actionsResult, bookmarksResult, notesResult, tabsResult, remindersResult] =
                await Promise.all([
                    context.models.actions.all({
                        user,
                        perPage: actionsParams.perPage,
                        page: actionsParams.page,
                        search: actionsParams.search,
                        sortKey: actionsParams.sortKey,
                        direction: actionsParams.direction,
                        excludeHidden: true,
                    }),
                    context.models.bookmarks.all({
                        user,
                        perPage: bookmarksParams.perPage,
                        page: bookmarksParams.page,
                        search: bookmarksParams.search,
                        sortKey: bookmarksParams.sortKey,
                        direction: bookmarksParams.direction,
                        excludeHidden: true,
                    }),
                    context.models.notes.all({
                        user,
                        perPage: notesParams.perPage,
                        page: notesParams.page,
                        search: notesParams.search,
                        sortKey: notesParams.sortKey,
                        direction: notesParams.direction,
                        excludeHidden: true,
                    }),
                    context.models.tabs.all({
                        user,
                        perPage: tabsParams.perPage,
                        page: tabsParams.page,
                        search: tabsParams.search,
                        sortKey: tabsParams.sortKey,
                        direction: tabsParams.direction,
                    }),
                    context.models.reminders.all({
                        user,
                        perPage: remindersParams.perPage,
                        page: remindersParams.page,
                        search: remindersParams.search,
                        sortKey: remindersParams.sortKey,
                        direction: remindersParams.direction,
                    }),
                ]);

            // CACHING STRATEGY: Browser-based HTTP caching
            // This eliminates the need for complex client-side cache management
            res.set({
                // Cache-Control header breakdown:
                // - 'private': Cache only in user's browser, not in shared proxies
                // - 'max-age=60': Cache is fresh for 60 seconds (1 minute)
                // - 'stale-while-revalidate=300': After 60s, browser can use stale cache
                //   while fetching fresh data in background for up to 300s (5 minutes)
                'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',

                // Vary header ensures different encodings (gzip, br) are cached separately
                Vary: 'Accept-Encoding',
            });

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
