import { getConnInfo } from '@hono/node-server/conninfo';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppContext, User } from '../type.js';
import type { AppContextContext, AppMiddleware, AppLocals } from '../http.js';
import { createAppRequest } from '../http.js';

const FORM_DATA_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const USER_CACHE_TTL = 5 * 60 * 1000;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 100;

interface RateBucket {
    count: number;
    resetAt: number;
}

let cachedStaticLocals: {
    copyRightYear: number;
    version: { style: string | number; script: string | number };
    utils: Record<string, any>;
} | null = null;

export function createRequestLoggerMiddleware(ctx: AppContext): AppMiddleware {
    return async (c, next) => {
        const requestId = c.get('requestId') || ctx.libs.crypto.randomUUID().slice(0, 8);
        const start = Date.now();
        const logger = ctx.logger.tag('requestId', requestId).tag('method', c.req.method);

        c.set('logger', logger);
        c.set('user', undefined);
        c.set('locals', {});

        await next();

        const duration = Date.now() - start;
        const query = c.req.query();
        const hasQuery = Object.keys(query).length > 0;
        const user = c.get('user');

        logger.info('request', {
            path: c.req.path,
            query: hasQuery ? JSON.stringify(query) : undefined,
            status: c.res.status,
            duration: `${duration}ms`,
            userId: user?.id || c.get('session')?.user?.id || 'anon',
            ip: getClientIp(c),
            slow: duration >= ctx.config.app.slowRequestMs ? 'true' : undefined,
            ua: c.req.header('user-agent')?.slice(0, 50),
            ref: c.req.header('referer')?.slice(0, 100),
        });
    };
}

export function createNotFoundMiddleware(ctx: AppContext) {
    return (c: AppContextContext) => {
        const message = 'Sorry, the page you are looking for could not be found.';

        const html = ctx.utils.template.render('general/error.html', {
            ...getLocals(ctx, c),
            path: c.req.path,
            title: 'Error',
            statusCode: 404,
            message,
        });
        return c.html(html, 404);
    };
}

export function createErrorMiddleware(ctx: AppContext) {
    return async (error: Error, c: AppContextContext) => {
        const req = createAppRequest(c);
        const logger = c.get('logger') || ctx.logger;

        logger.error(`${req.method} ${req.path} - ${error.message}`, {
            error,
            url: req.url,
            userId: req.user?.id || req.session?.user?.id,
        });

        if (!(error instanceof ctx.errors.HttpError)) {
            error = new ctx.errors.HttpError(500, error.message, req);
        } else if (error instanceof ctx.errors.HttpError && !(error as any).request) {
            (error as any).request = req;
        }

        const httpError = error as any;
        const statusCode = httpError.statusCode || 500;
        const message =
            httpError.message ||
            'The server encountered an internal error or misconfiguration and was unable to complete your request';

        if (statusCode === 422) {
            if (httpError instanceof ctx.errors.ValidationError) {
                req.session.errors = httpError.errors;
            } else {
                req.session.errors = { general: message };
            }

            req.session.input = req.body as Record<string, any>;
            req.flash(
                'error',
                Object.values(req.session.errors as Record<string, string>).join(', '),
            );

            if (req.path === '/login') {
                return c.redirect('/?modal=login');
            }

            return c.redirect(req.headers.referer || '/');
        }

        if (ctx.config.app.env === 'production') {
            ctx.utils.ntfy.sendErrorNotification(req, error, statusCode);
        } else {
            ctx.logger.info('ntfy error notification suppressed (non-production environment)', {
                error,
                statusCode,
                message,
                stack: error.stack,
            });
        }

        const html = ctx.utils.template.render('general/error.html', {
            ...getLocals(ctx, c),
            path: req.path,
            title: 'Error',
            statusCode,
            message: ctx.config.app.env !== 'production' ? error.stack : message,
        });

        return c.html(html, statusCode as ContentfulStatusCode);
    };
}

export function createAdminOnlyMiddleware(ctx: AppContext): AppMiddleware {
    return async (c, next) => {
        const req = createAppRequest(c);
        const user = c.get('user');

        if (!user || !user.is_admin || !req.session?.user?.is_admin) {
            throw new ctx.errors.UnauthorizedError('Unauthorized', req);
        }

        await next();
    };
}

export function createSpeculationRulesMiddleware(): AppMiddleware {
    return async (c, next) => {
        c.header('Supports-Loading-Mode', 'credentialed-prerender');
        await next();
    };
}

export function createCsrfMiddleware(ctx: AppContext): AppMiddleware {
    return async (c, next) => {
        const req = createAppRequest(c);
        const session = c.get('session');

        session.csrfToken ??= ctx.libs.crypto.randomBytes(32).toString('hex');
        c.get('locals').csrfToken = session.csrfToken;

        const isSafeMethod =
            req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS';
        if (!isSafeMethod) {
            const token = req.body?.csrfToken || req.headers['x-csrf-token'];
            if (!token || token !== session.csrfToken) {
                throw new ctx.errors.HttpError(
                    403,
                    'Invalid or missing CSRF token. Please refresh the page and try again.',
                    req,
                );
            }
        }

        c.set('sessionChanged', true);
        await next();
    };
}

export function createAppLocalStateMiddleware(ctx: AppContext): AppMiddleware {
    return async (c, next) => {
        const req = createAppRequest(c);

        if (FORM_DATA_METHODS.has(req.method)) {
            req.session.input = req.body as Record<string, any>;
        }

        const locals = await buildAppLocals(ctx, c);
        c.set('locals', locals);

        delete req.session.input;
        delete req.session.errors;
        c.set('sessionChanged', true);

        await next();
    };
}

export function createAuthenticationMiddleware(ctx: AppContext): AppMiddleware {
    return async (c, next) => {
        const req = createAppRequest(c);
        let user: User | null = null;
        let needsRefresh = false;

        if (req.session?.user) {
            const cachedAt = req.session.userCachedAt || 0;
            const cacheExpired = Date.now() - cachedAt > USER_CACHE_TTL;

            if (!cacheExpired && req.session.user.id) {
                user = req.session.user;
            } else {
                needsRefresh = true;
                user = await ctx.models.users.read(req.session.user.id);
                if (!user) {
                    req.session.destroy();
                }
            }
        }

        if (!user) {
            req.session.redirectTo = req.originalUrl || req.url;
            req.session.save();
            return c.redirect('/?modal=login');
        }

        const parsedUser = needsRefresh
            ? ({
                  ...user,
                  column_preferences: ctx.utils.util.parseColumnPreferences(
                      user?.column_preferences,
                  ),
              } as User)
            : (user as User);

        c.set('user', parsedUser);

        if (needsRefresh) {
            req.session.user = parsedUser;
            req.session.userCachedAt = Date.now();
            req.session.save();
        }

        await next();
    };
}

export function createRateLimitMiddleware(ctx: AppContext): AppMiddleware {
    const buckets = new Map<string, RateBucket>();

    return async (c, next) => {
        if (ctx.config.app.env !== 'production') return next();

        const ip = getClientIp(c);
        const now = Date.now();
        const bucket = buckets.get(ip);

        if (!bucket || bucket.resetAt <= now) {
            buckets.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
            c.header('RateLimit-Limit', String(RATE_MAX));
            c.header('RateLimit-Remaining', String(RATE_MAX - 1));
            c.header('RateLimit-Reset', String(Math.ceil(RATE_WINDOW_MS / 1000)));
            return next();
        }

        bucket.count++;
        const remaining = Math.max(0, RATE_MAX - bucket.count);
        c.header('RateLimit-Limit', String(RATE_MAX));
        c.header('RateLimit-Remaining', String(remaining));
        c.header('RateLimit-Reset', String(Math.ceil((bucket.resetAt - now) / 1000)));

        if (bucket.count <= RATE_MAX) {
            return next();
        }

        const html = ctx.utils.template.render('general/rate-limit.html', getLocals(ctx, c));
        return c.html(html, 429);
    };
}

export function createTurnstileMiddleware(ctx: AppContext): AppMiddleware {
    return async (c, next) => {
        const req = createAppRequest(c);

        if (ctx.config.app.env !== 'production') {
            req.logger
                .tag('middleware', 'turnstile')
                .info('Skipping in non-production environment');
            return next();
        }

        if (req.method === 'GET') {
            return next();
        }

        const token = req.body['cf-turnstile-response'];
        if (!token) {
            throw new ctx.errors.ValidationError({
                email: 'Turnstile verification failed: Missing token',
            });
        }

        await ctx.utils.util.verifyTurnstileToken(token, req.ip);
        await next();
    };
}

async function buildAppLocals(ctx: AppContext, c: AppContextContext): Promise<AppLocals> {
    if (!cachedStaticLocals) {
        const isProd = ctx.config.app.env === 'production';
        const assetVersions = isProd ? ctx.utils.assets.getAssetVersions() : null;
        cachedStaticLocals = {
            copyRightYear: ctx.libs.dayjs().year(),
            version: {
                style: assetVersions?.style ?? Math.random(),
                script: assetVersions?.script ?? Math.random(),
            },
            utils: {
                nl2br: ctx.utils.html.nl2br,
                truncateString: ctx.utils.util.truncateString,
                capitalize: ctx.utils.util.capitalize,
                getFaviconUrl: ctx.utils.util.getFaviconUrl,
                getScreenshotUrl: ctx.utils.util.getScreenshotUrl,
                isUrlLike: ctx.utils.validation.isUrlLike,
                stripHtmlTags: ctx.utils.html.stripHtmlTags,
                highlightSearchTerm: ctx.utils.html.highlightSearchTerm,
                formatDateInTimezone: ctx.utils.date.formatDateInTimezone,
            },
        };
    }

    const req = createAppRequest(c);
    const sessionUser = req.session?.user;
    const userWithParsedPrefs = sessionUser
        ? {
              ...sessionUser,
              column_preferences: ctx.utils.util.parseColumnPreferences(
                  sessionUser.column_preferences,
              ),
          }
        : undefined;

    return {
        csrfToken: req.session.csrfToken ?? '',
        utils: cachedStaticLocals.utils,
        state: {
            cloudflare_turnstile_site_key: ctx.config.cloudflare.turnstileSiteKey,
            env: ctx.config.app.env,
            user: c.get('user') ?? userWithParsedPrefs,
            copyRightYear: cachedStaticLocals.copyRightYear,
            input: (req.session?.input as Record<string, string>) || {},
            errors: (req.session?.errors as Record<string, string>) || {},
            flash: {
                success: req.flash('success'),
                error: req.flash('error'),
                info: req.flash('info'),
                warning: req.flash('warning'),
            },
            version: cachedStaticLocals.version,
            branding: await ctx.models.settings.getBranding(),
        },
    };
}

function getLocals(ctx: AppContext, c: AppContextContext) {
    const locals = c.get('locals');
    if (locals?.state) return locals;

    if (!cachedStaticLocals) {
        const isProd = ctx.config.app.env === 'production';
        const assetVersions = isProd ? ctx.utils.assets.getAssetVersions() : null;
        cachedStaticLocals = {
            copyRightYear: ctx.libs.dayjs().year(),
            version: {
                style: assetVersions?.style ?? Math.random(),
                script: assetVersions?.script ?? Math.random(),
            },
            utils: {
                nl2br: ctx.utils.html.nl2br,
                truncateString: ctx.utils.util.truncateString,
                capitalize: ctx.utils.util.capitalize,
                getFaviconUrl: ctx.utils.util.getFaviconUrl,
                getScreenshotUrl: ctx.utils.util.getScreenshotUrl,
                isUrlLike: ctx.utils.validation.isUrlLike,
                stripHtmlTags: ctx.utils.html.stripHtmlTags,
                highlightSearchTerm: ctx.utils.html.highlightSearchTerm,
                formatDateInTimezone: ctx.utils.date.formatDateInTimezone,
            },
        };
    }

    const fallback = {
        csrfToken: c.get('session')?.csrfToken ?? '',
        utils: cachedStaticLocals.utils,
        state: {
            env: ctx.config.app.env,
            user: c.get('user') ?? c.get('session')?.user,
            copyRightYear: cachedStaticLocals.copyRightYear,
            input: {},
            errors: {},
            flash: { success: [], error: [], info: [], warning: [] },
            version: cachedStaticLocals.version,
            cloudflare_turnstile_site_key: ctx.config.cloudflare.turnstileSiteKey,
            branding: {
                appName: 'Bang',
                appUrl: ctx.config.app.appUrl,
                showFooter: true,
                showSearchPage: true,
                showAboutPage: true,
            },
        },
    };
    c.set('locals', fallback);
    return fallback;
}

function getClientIp(c: AppContextContext): string {
    const forwarded = c.req.header('x-forwarded-for');
    if (forwarded != null) return forwarded.split(',')[0]!.trim();
    const real = c.req.header('x-real-ip');
    if (real != null) return real.trim();
    try {
        return getConnInfo(c).remote.address ?? 'unknown';
    } catch {
        return 'unknown';
    }
}
