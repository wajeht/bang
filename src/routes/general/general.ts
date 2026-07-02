import { bangs } from '../../db/bang.js';
import type { AppRequest as Request, AppResponse as Response } from '../../http.js';
import type { Bang, User, AppContext, BangWithLowercase } from '../../type.js';
import { createHonoApp } from '../../http.js';

export function createGeneralRouter(ctx: AppContext) {
    const router = createHonoApp(ctx);

    router.get('/healthz', async (req: Request, res: Response) => {
        await ctx.db.raw('SELECT 1');

        if (req.header('Content-Type')?.includes('application/json')) {
            return res.json({ status: 'ok', database: 'connected' });
        }

        return res.set({ 'Content-Type': 'text/html' }).send('<p>ok</p>');
    });

    router.get(
        '/metrics',
        ctx.middleware.authentication,
        ctx.middleware.adminOnly,
        (_req: Request, res: Response) => {
            const mem = process.memoryUsage();
            const cpuUsage = process.cpuUsage();

            return res.json({
                memory: {
                    rss: `${Math.round(mem.rss / 1024 / 1024)} MB`,
                    heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)} MB`,
                    heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
                    external: `${Math.round(mem.external / 1024 / 1024)} MB`,
                    arrayBuffers: `${Math.round((mem.arrayBuffers || 0) / 1024 / 1024)} MB`,
                },
                cpu: {
                    user: `${Math.round(cpuUsage.user / 1000)} ms`,
                    system: `${Math.round(cpuUsage.system / 1000)} ms`,
                },
                process: {
                    uptime: `${Math.round(process.uptime())} seconds`,
                    pid: process.pid,
                    nodeVersion: process.version,
                    platform: process.platform,
                    arch: process.arch,
                },
                env: ctx.config.app.env,
            });
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

            res.set({
                'Cache-Control': 'private, max-age=60, stale-while-revalidate=300',
                Vary: 'Accept-Encoding',
            });

            return res.json({
                actions: actionsResult,
                bookmarks: bookmarksResult,
                notes: notesResult,
                tabs: tabsResult,
                reminders: remindersResult,
                search: actionsParams.search,
                sortKey: actionsParams.sortKey,
                direction: actionsParams.direction,
            });
        },
    );

    const activeBangsPrefetch = new Set<string>();

    const bangsArray = Object.values(bangs as Record<string, Bang>);

    const bangsWithLowercase: BangWithLowercase[] = bangsArray.map((bang) => ({
        ...bang,
        _tLower: bang.t.toLowerCase(),
        _sLower: bang.s.toLowerCase(),
        _dLower: bang.d.toLowerCase(),
    }));

    router.get('/', async (req: Request, res: Response) => {
        const query = (typeof req.query.q === 'string' ? req.query.q : '').trim();
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
            search: searchTermRaw = '',
            sort_key = 't',
            direction = 'asc',
            page = 1,
            per_page = 100,
        } = req.query;

        const searchTerm = typeof searchTermRaw === 'string' ? searchTermRaw : '';
        const searchStr = searchTerm.toLowerCase();
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
            const searchTermStr = searchTerm;
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

        return res.render('general/bangs-index.html', {
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

                await ctx.utils.util.prefetchScreenshots(urls, {
                    delayBetweenBatchesMs: 2000,
                });

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

    return router;
}
