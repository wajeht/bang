import { bangs } from '../../db/bang';
import type { Request, Response } from 'express';
import type { Bang, User, AppContext, BangWithLowercase } from '../../type';

export function GeneralRouter(ctx: AppContext) {
    const activeBangsPrefetch = new Set<string>();

    const bangsArray = Object.values(bangs as Record<string, Bang>);

    const bangsWithLowercase: BangWithLowercase[] = bangsArray.map((bang) => ({
        ...bang,
        _tLower: bang.t.toLowerCase(),
        _sLower: bang.s.toLowerCase(),
        _dLower: bang.d.toLowerCase(),
    }));

    const router = ctx.libs.express.Router();

    router.get('/healthz', async (req: Request, res: Response) => {
        await ctx.db.raw('SELECT 1');

        if (ctx.utils.request.expectsJson(req)) {
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

        await ctx.utils.search.search({ res, user, query, req });
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

        const searchStr = String(searchTerm).toLowerCase();
        const hasSearch = searchStr.length > 0;
        const key = sort_key as keyof Bang;
        const isAsc = direction === 'asc';
        const sortMultiplier = isAsc ? 1 : -1;

        let filteredBangs: BangWithLowercase[];

        if (hasSearch) {
            filteredBangs = [];
            const len = bangsWithLowercase.length;
            for (let i = 0; i < len; i++) {
                const bang = bangsWithLowercase[i]!;
                if (
                    bang._tLower.includes(searchStr) ||
                    bang._sLower.includes(searchStr) ||
                    bang._dLower.includes(searchStr)
                ) {
                    filteredBangs.push(bang);
                }
            }
        } else {
            filteredBangs = bangsWithLowercase;
        }

        const sortedBangs = hasSearch
            ? filteredBangs.sort((a, b) => {
                  if (a[key] < b[key]) return -sortMultiplier;
                  if (a[key] > b[key]) return sortMultiplier;
                  return 0;
              })
            : [...filteredBangs].sort((a, b) => {
                  if (a[key] < b[key]) return -sortMultiplier;
                  if (a[key] > b[key]) return sortMultiplier;
                  return 0;
              });

        const { data, ...pagination } = ctx.utils.util.paginate(sortedBangs, {
            page: Number(page),
            perPage: Number(per_page),
            total: sortedBangs.length,
        });

        // Only highlight the paginated data
        let highlightedData: Bang[];
        if (hasSearch) {
            const dataLen = data.length;
            // oxlint-disable-next-line unicorn/no-new-array
            highlightedData = new Array(dataLen);
            const searchTermStr = String(searchTerm);
            for (let i = 0; i < dataLen; i++) {
                const bang = data[i]!;
                highlightedData[i] = {
                    c: ctx.utils.html.highlightSearchTerm(bang.c, searchTermStr) ?? bang.c,
                    d: ctx.utils.html.highlightSearchTerm(bang.d, searchTermStr) ?? bang.d,
                    r: bang.r,
                    s: ctx.utils.html.highlightSearchTerm(bang.s, searchTermStr) ?? bang.s,
                    sc: ctx.utils.html.highlightSearchTerm(bang.sc, searchTermStr) ?? bang.sc,
                    t: ctx.utils.html.highlightSearchTerm(bang.t, searchTermStr) ?? bang.t,
                    u: ctx.utils.html.highlightSearchTerm(bang.u, searchTermStr) ?? bang.u,
                };
            }
        } else {
            highlightedData = data;
        }

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

    router.post(
        '/bangs/prefetch',
        ctx.middleware.authentication,
        ctx.middleware.adminOnly,
        async (req: Request, res: Response) => {
            const adminId = 'admin';

            if (activeBangsPrefetch.has(adminId)) {
                req.flash('info', 'Screenshot caching already in progress...');
                return res.redirect('/bangs');
            }

            activeBangsPrefetch.add(adminId);

            try {
                const urls: string[] = [];
                const len = bangsArray.length;
                for (let i = 0; i < len; i++) {
                    const bang = bangsArray[i];
                    if (!bang) continue;
                    const url = bang.u.replace('{{{s}}}', '');
                    if (url && url.startsWith('http')) {
                        urls.push(url);
                    }
                }

                if (urls.length === 0) {
                    req.flash('info', 'No URLs to prefetch');
                    return res.redirect('/bangs');
                }

                const batchSize = 5;
                const delayBetweenBatches = 2000;

                for (let i = 0; i < urls.length; i += batchSize) {
                    const batch = urls.slice(i, i + batchSize);
                    await Promise.allSettled(
                        batch.map(async (url) => {
                            const controller = new AbortController();
                            const timeout = setTimeout(() => controller.abort(), 10000);
                            try {
                                const response = await fetch(
                                    `https://screenshot.jaw.dev?url=${encodeURIComponent(url)}`,
                                    {
                                        method: 'HEAD',
                                        headers: {
                                            'User-Agent': 'Bang/1.0 (https://bang.jaw.dev)',
                                        },
                                        signal: controller.signal,
                                    },
                                );
                                await response.text().catch(() => {});
                            } catch {
                                // Ignore errors
                            } finally {
                                clearTimeout(timeout);
                            }
                        }),
                    );

                    if (i + batchSize < urls.length) {
                        await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
                    }
                }

                req.flash('success', `Cached ${urls.length} screenshots successfully`);
            } catch (error) {
                ctx.logger.error('Bangs prefetch failed', { error });
                req.flash('error', 'Failed to cache screenshots');
            } finally {
                activeBangsPrefetch.delete(adminId);
            }

            return res.redirect('/bangs');
        },
    );

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
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const actionsParams = ctx.utils.request.extractPaginationParams(req, 'actions');
            const bookmarksParams = ctx.utils.request.extractPaginationParams(req, 'bookmarks');
            const notesParams = ctx.utils.request.extractPaginationParams(req, 'notes');
            const tabsParams = ctx.utils.request.extractPaginationParams(req, 'tabs');
            const remindersParams = ctx.utils.request.extractPaginationParams(req, 'reminders');

            const [actionsResult, bookmarksResult, notesResult, tabsResult, remindersResult] =
                await Promise.all([
                    ctx.models.actions.all({
                        user,
                        perPage: actionsParams.perPage,
                        page: actionsParams.page,
                        search: actionsParams.search,
                        sortKey: actionsParams.sortKey,
                        direction: actionsParams.direction,
                        excludeHidden: true,
                    }),
                    ctx.models.bookmarks.all({
                        user,
                        perPage: bookmarksParams.perPage,
                        page: bookmarksParams.page,
                        search: bookmarksParams.search,
                        sortKey: bookmarksParams.sortKey,
                        direction: bookmarksParams.direction,
                        excludeHidden: true,
                    }),
                    ctx.models.notes.all({
                        user,
                        perPage: notesParams.perPage,
                        page: notesParams.page,
                        search: notesParams.search,
                        sortKey: notesParams.sortKey,
                        direction: notesParams.direction,
                        excludeHidden: true,
                    }),
                    ctx.models.tabs.all({
                        user,
                        perPage: tabsParams.perPage,
                        page: tabsParams.page,
                        search: tabsParams.search,
                        sortKey: tabsParams.sortKey,
                        direction: tabsParams.direction,
                    }),
                    ctx.models.reminders.all({
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
