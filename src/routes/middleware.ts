import { getConnInfo } from '@hono/node-server/conninfo';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type {
    AppContext,
    HonoContext,
    AppLocals,
    AppMiddleware,
    AppSession,
    AppSessionData,
    User,
} from '../type.js';

const SESSION_COOKIE_NAME = 'bang.sid';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
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
    utils: Record<string, unknown>;
} | null = null;

export function createBodyParserMiddleware(): AppMiddleware {
    return async (c, next) => {
        if (!FORM_DATA_METHODS.has(c.req.method)) {
            c.set('body', {});
            return next();
        }

        const contentType = c.req.header('content-type') ?? '';
        if (contentType.includes('application/json')) {
            c.set('body', await c.req.json().catch(() => ({})));
            return next();
        }

        if (
            contentType.includes('application/x-www-form-urlencoded') ||
            contentType.includes('multipart/form-data')
        ) {
            const body = await c.req.parseBody({ all: true, dot: true });
            // parseBody keeps the `[]` suffix on array field names (e.g. `id[]`)
            for (const key of Object.keys(body)) {
                const value = body[key];
                if (key.endsWith('[]') && value !== undefined) {
                    body[key.slice(0, -2)] = value;
                    delete body[key];
                }
            }
            c.set('body', body);
            return next();
        }

        c.set('body', {});
        return next();
    };
}

export function createSessionMiddleware(ctx: AppContext): AppMiddleware {
    return async (c, next) => {
        const cookieSid = getCookie(c, SESSION_COOKIE_NAME);
        const sid = cookieSid || ctx.libs.crypto.randomUUID();
        const sessionData = cookieSid ? await loadSession(ctx, cookieSid) : {};
        const session = createSession(ctx, c, sid, sessionData);

        c.set('session', session);
        c.set('sessionChanged', !cookieSid);
        c.set('sessionDestroyed', false);

        await next();

        if (c.get('sessionDestroyed')) {
            await ctx.db('sessions').where({ sid: session.id }).delete();
            deleteCookie(c, SESSION_COOKIE_NAME, { path: '/' });
            return;
        }

        if (c.get('sessionChanged')) {
            await saveSession(ctx, session);
            setCookie(c, SESSION_COOKIE_NAME, session.id, {
                path: '/',
                domain:
                    ctx.config.app.env === 'production'
                        ? `.${ctx.config.session.domain}`
                        : undefined,
                maxAge: Math.floor(SESSION_TTL_MS / 1000),
                httpOnly: true,
                sameSite: 'Lax',
                secure: ctx.config.app.env === 'production',
            });
        }
    };
}

export function createRendererMiddleware(ctx: AppContext): AppMiddleware {
    return async (c, next) => {
        c.setRenderer((view, props = {}) => {
            const locals = c.get('locals');
            return c.html(
                ctx.utils.template.render(view, {
                    ...locals,
                    csrfToken: locals.csrfToken ?? '',
                    ...props,
                }),
            );
        });
        await next();
    };
}

export function setFlash(c: HonoContext, type: string, message: string) {
    const session = c.get('session');
    session.flash = {
        ...session.flash,
        [type]: [...(session.flash?.[type] ?? []), message],
    };
    c.set('sessionChanged', true);
}

export function createRequestLoggerMiddleware(ctx: AppContext): AppMiddleware {
    return async (c, next) => {
        const requestId = c.get('requestId') || ctx.libs.crypto.randomUUID().slice(0, 8);
        const start = Date.now();
        const logger = ctx.logger.tag('requestId', requestId).tag('method', c.req.method);

        c.set('logger', logger);
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
    return async (c: HonoContext) => {
        const message = 'Sorry, the page you are looking for could not be found.';

        const html = ctx.utils.template.render('general/error.html', {
            ...(await getLocals(ctx, c)),
            path: c.req.path,
            title: 'Error',
            statusCode: 404,
            message,
        });
        return c.html(html, 404);
    };
}

export function createErrorMiddleware(ctx: AppContext) {
    return async (error: Error, c: HonoContext) => {
        const logger = c.get('logger') || ctx.logger;
        const session = c.get('session');
        const body = c.get('body') ?? {};

        logger.error(`${c.req.method} ${c.req.path} - ${error.message}`, {
            error,
            url: c.req.url,
            userId: c.get('user')?.id || session?.user?.id,
        });

        let httpError: InstanceType<typeof ctx.errors.HttpError>;
        if (error instanceof ctx.errors.HttpError) {
            httpError = error;
        } else if (error instanceof HTTPException) {
            httpError = new ctx.errors.HttpError(error.status, error.message);
        } else {
            httpError = new ctx.errors.HttpError(500, error.message);
        }
        const statusCode = httpError.statusCode || 500;
        const message =
            httpError.message ||
            'The server encountered an internal error or misconfiguration and was unable to complete your request';

        if (statusCode === 422) {
            if (httpError instanceof ctx.errors.ValidationError) {
                session.errors = httpError.errors;
            } else {
                session.errors = { general: message };
            }

            session.input = body;
            setFlash(c, 'error', Object.values(session.errors ?? {}).join(', '));

            if (c.req.path === '/login') {
                return c.redirect('/?modal=login');
            }

            return c.redirect(c.req.header('referer') || '/');
        }

        if (ctx.config.app.env === 'production') {
            ctx.utils.ntfy.sendErrorNotification(c, error, statusCode);
        } else {
            ctx.logger.info('ntfy error notification suppressed (non-production environment)', {
                error,
                statusCode,
                message,
                stack: error.stack,
            });
        }

        const html = ctx.utils.template.render('general/error.html', {
            ...(await getLocals(ctx, c)),
            path: c.req.path,
            title: 'Error',
            statusCode,
            message: ctx.config.app.env !== 'production' ? error.stack : message,
        });

        return c.html(html, statusCode as ContentfulStatusCode);
    };
}

export function createAdminOnlyMiddleware(ctx: AppContext): AppMiddleware {
    return async (c, next) => {
        const user = c.get('user');
        const session = c.get('session');

        if (!user || !user.is_admin || !session?.user?.is_admin) {
            throw new ctx.errors.UnauthorizedError('Unauthorized');
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
        const session = c.get('session');

        if (session.csrfToken == null) {
            session.csrfToken = ctx.libs.crypto.randomBytes(32).toString('hex');
            c.set('sessionChanged', true);
        }
        c.get('locals').csrfToken = session.csrfToken;

        const isSafeMethod =
            c.req.method === 'GET' || c.req.method === 'HEAD' || c.req.method === 'OPTIONS';
        if (!isSafeMethod) {
            const body = c.get('body') ?? {};
            const token = body.csrfToken || c.req.header('x-csrf-token');
            if (!token || token !== session.csrfToken) {
                throw new ctx.errors.HttpError(
                    403,
                    'Invalid or missing CSRF token. Please refresh the page and try again.',
                );
            }
        }

        await next();
    };
}

export function createAppLocalStateMiddleware(ctx: AppContext): AppMiddleware {
    return async (c, next) => {
        const session = c.get('session');
        // input/errors persisted by a previous request's 422 need a save to clear
        const hadValidationState = session.input != null || session.errors != null;

        if (FORM_DATA_METHODS.has(c.req.method)) {
            session.input = c.get('body') ?? {};
        }

        const locals = await buildAppLocals(ctx, c);
        c.set('locals', locals);

        delete session.input;
        delete session.errors;
        if (hadValidationState) {
            c.set('sessionChanged', true);
        }

        await next();
    };
}

export function createAuthenticationMiddleware(ctx: AppContext): AppMiddleware {
    return async (c, next) => {
        const session = c.get('session');
        let user: User | null = null;
        let needsRefresh = false;

        if (session?.user) {
            const cachedAt = session.userCachedAt || 0;
            const cacheExpired = Date.now() - cachedAt > USER_CACHE_TTL;

            if (!cacheExpired && session.user.id) {
                user = session.user;
            } else {
                needsRefresh = true;
                user = await ctx.models.users.read(session.user.id);
                if (!user) {
                    session.destroy();
                }
            }
        }

        if (!user) {
            const url = new URL(c.req.url);
            session.redirectTo = url.pathname + url.search;
            session.save();
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
            session.user = parsedUser;
            session.userCachedAt = Date.now();
            session.save();
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

        const html = ctx.utils.template.render('general/rate-limit.html', await getLocals(ctx, c));
        return c.html(html, 429);
    };
}

export function createTurnstileMiddleware(ctx: AppContext): AppMiddleware {
    return async (c, next) => {
        if (ctx.config.app.env !== 'production') {
            c.get('logger')
                .tag('middleware', 'turnstile')
                .info('Skipping in non-production environment');
            return next();
        }

        if (c.req.method === 'GET') {
            return next();
        }

        const body = c.get('body') ?? {};
        const token = body['cf-turnstile-response'];
        if (typeof token !== 'string' || !token) {
            throw new ctx.errors.ValidationError({
                email: 'Turnstile verification failed: Missing token',
            });
        }

        await ctx.utils.util.verifyTurnstileToken(token, getClientIp(c));
        await next();
    };
}

function getStaticLocals(ctx: AppContext) {
    if (!cachedStaticLocals) {
        const isProd = ctx.config.app.env === 'production';
        const assetVersions = isProd ? ctx.utils.assets.getAssetVersions() : null;
        cachedStaticLocals = {
            copyRightYear: ctx.utils.date.currentYear(),
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
    return cachedStaticLocals;
}

async function buildAppLocals(ctx: AppContext, c: HonoContext): Promise<AppLocals> {
    const staticLocals = getStaticLocals(ctx);
    const session = c.get('session');
    const sessionUser = session?.user;
    const userWithParsedPrefs = sessionUser
        ? {
              ...sessionUser,
              column_preferences: ctx.utils.util.parseColumnPreferences(
                  sessionUser.column_preferences,
              ),
          }
        : undefined;

    return {
        csrfToken: session.csrfToken ?? '',
        utils: staticLocals.utils,
        state: {
            cloudflare_turnstile_site_key: ctx.config.cloudflare.turnstileSiteKey,
            env: ctx.config.app.env,
            user: c.get('user') ?? userWithParsedPrefs,
            copyRightYear: staticLocals.copyRightYear,
            input: session?.input ?? {},
            errors: session?.errors ?? {},
            flash: {
                success: getFlashMessages(c, 'success'),
                error: getFlashMessages(c, 'error'),
                info: getFlashMessages(c, 'info'),
                warning: getFlashMessages(c, 'warning'),
            },
            version: staticLocals.version,
            branding: await ctx.models.settings.getBranding(),
        },
    };
}

function getFlashMessages(c: HonoContext, type: string): string[] {
    const session = c.get('session');
    const messages = session.flash?.[type] ?? [];
    if (session.flash?.[type]) {
        delete session.flash[type];
        c.set('sessionChanged', true);
    }
    return messages;
}

async function getLocals(ctx: AppContext, c: HonoContext): Promise<AppLocals> {
    const locals = c.get('locals');
    if (locals?.state) return locals;

    const staticLocals = getStaticLocals(ctx);

    const fallback = {
        csrfToken: c.get('session')?.csrfToken ?? '',
        utils: staticLocals.utils,
        state: {
            env: ctx.config.app.env,
            user: c.get('user') ?? c.get('session')?.user,
            copyRightYear: staticLocals.copyRightYear,
            input: {},
            errors: {},
            flash: { success: [], error: [], info: [], warning: [] },
            version: staticLocals.version,
            cloudflare_turnstile_site_key: ctx.config.cloudflare.turnstileSiteKey,
            branding: await ctx.models.settings.getBranding(),
        },
    };
    c.set('locals', fallback);
    return fallback;
}

function createSession(
    ctx: AppContext,
    c: HonoContext,
    sid: string,
    data: AppSessionData,
): AppSession {
    const session: AppSession = {
        ...data,
        id: sid,
        save(callback?: (error?: Error) => void) {
            c.set('sessionChanged', true);
            void saveSession(ctx, session)
                .then(() => callback?.())
                .catch((error) => callback?.(error));
        },
        destroy(callback?: (error?: Error) => void) {
            c.set('sessionDestroyed', true);
            callback?.();
        },
        regenerate(callback?: (error?: Error) => void) {
            session.id = ctx.libs.crypto.randomUUID();
            c.set('sessionChanged', true);
            callback?.();
        },
    };

    return session;
}

async function loadSession(ctx: AppContext, sid: string): Promise<AppSessionData> {
    const row = await ctx.db('sessions').where({ sid }).first();
    if (!row) return {};

    if (new Date(row.expired).getTime() <= Date.now()) {
        await ctx.db('sessions').where({ sid }).delete();
        return {};
    }

    if (typeof row.sess === 'string') {
        return JSON.parse(row.sess);
    }

    return row.sess ?? {};
}

async function saveSession(ctx: AppContext, session: AppSession) {
    const { id: _id, save: _save, destroy: _destroy, regenerate: _regenerate, ...data } = session;

    await ctx
        .db('sessions')
        .insert({
            sid: session.id,
            sess: JSON.stringify(data),
            expired: new Date(Date.now() + SESSION_TTL_MS),
        })
        .onConflict('sid')
        .merge();
}

function getClientIp(c: HonoContext): string {
    const forwarded = c.req.header('x-forwarded-for')?.split(',')[0]?.trim();
    if (forwarded) return forwarded;
    const real = c.req.header('x-real-ip');
    if (real != null) return real.trim();
    try {
        return getConnInfo(c).remote.address ?? 'unknown';
    } catch {
        return 'unknown';
    }
}
