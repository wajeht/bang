import { bangs } from '../../db/bang.js';
import { AppResponse } from '../../type.js';
import type {
    AppContext,
    AppContextContext,
    AppEnv,
    Bang,
    BangWithLowercase,
    User,
} from '../../type.js';
import { createAppRequest, renderView, setFlash } from '../middleware.js';
import { Hono } from 'hono';

export function createGeneralRouter(ctx: AppContext) {
    const router = new Hono<AppEnv>();

    router.get('/healthz', async (c) => {
        await ctx.db.raw('SELECT 1');

        if (c.req.header('Content-Type')?.includes('application/json')) {
            return c.json({ status: 'ok', database: 'connected' });
        }

        return c.html('<p>ok</p>');
    });

    router.get('/metrics', ctx.middleware.authentication, ctx.middleware.adminOnly, (c) => {
        const mem = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        return c.json({
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
    });

    const activeBangsPrefetch = new Set<string>();

    const bangsArray = Object.values(bangs as Record<string, Bang>);

    const bangsWithLowercase: BangWithLowercase[] = bangsArray.map((bang) => ({
        ...bang,
        _tLower: bang.t.toLowerCase(),
        _sLower: bang.s.toLowerCase(),
        _dLower: bang.d.toLowerCase(),
    }));

    router.get('/', async (c: AppContextContext) => {
        const searchQuery = c.req.query('q')?.trim() ?? '';
        const user = c.get('session').user as User | undefined;

        if (!searchQuery) {
            return renderView(ctx, c, 'general/home.html', {
                path: '/',
                title: 'Search',
            });
        }

        const req = createAppRequest(c);
        const res = new AppResponse(c, ctx);
        await ctx.utils.search.search({ res, user, query: searchQuery, req });
        return res.response ?? c.body(null);
    });

    router.get('/about', async (c) => {
        return renderView(ctx, c, 'general/about.html', {
            path: '/about',
            title: 'About',
        });
    });

    router.get('/privacy-policy', async (c) => {
        return renderView(ctx, c, 'general/privacy-policy.html', {
            path: '/privacy-policy',
            title: 'Privacy Policy',
        });
    });

    router.get('/terms-of-service', async (c) => {
        return renderView(ctx, c, 'general/terms-of-service.html', {
            path: '/terms-of-service',
            title: 'Terms of Service',
        });
    });

    router.get('/bangs', async (c) => {
        const {
            search: searchTermRaw = '',
            sort_key = 't',
            direction = 'asc',
            page = 1,
            per_page = 100,
        } = c.req.query();

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

        return renderView(ctx, c, 'general/bangs-index.html', {
            layout: '_layouts/auth.html',
            user: c.get('session').user,
            path: c.req.path,
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
        async (c: AppContextContext) => {
            const adminId = 'admin';

            if (activeBangsPrefetch.has(adminId)) {
                setFlash(c, 'info', 'Screenshot caching already in progress...');
                return c.redirect('/bangs');
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
                    setFlash(c, 'info', 'No URLs to prefetch');
                    return c.redirect('/bangs');
                }

                await ctx.utils.util.prefetchScreenshots(urls, {
                    delayBetweenBatchesMs: 2000,
                });

                setFlash(c, 'success', `Cached ${urls.length} screenshots successfully`);
            } catch (error) {
                ctx.logger.error('Bangs prefetch failed', { error });
                setFlash(c, 'error', 'Failed to cache screenshots');
            } finally {
                activeBangsPrefetch.delete(adminId);
            }

            return c.redirect('/bangs');
        },
    );

    return router;
}
