import path from 'node:path';
import type { Context, MiddlewareHandler } from 'hono';
import { Hono } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { AppContext, Logger, User } from './type.js';

const SESSION_COOKIE_NAME = 'bang.sid';
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;
const FORM_DATA_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);
const HONO_MIDDLEWARE = Symbol('honoMiddleware');

export interface AppSessionData {
    redirectTo?: string | null;
    user?: User | null;
    input?: Record<string, unknown> | null;
    errors?: Record<string, unknown> | null;
    searchCount?: number;
    cumulativeDelay?: number;
    verifiedHiddenItems?: Record<string, number>;
    hiddenItemsVerified?: boolean;
    hiddenItemsVerifiedAt?: number;
    userCachedAt?: number;
    csrfToken?: string;
    flash?: Record<string, string[]>;
}

export interface AppSession extends AppSessionData {
    id: string;
    save(callback?: (error?: Error) => void): void;
    destroy(callback?: (error?: Error) => void): void;
    regenerate(callback?: (error?: Error) => void): void;
}

export interface AppLocals {
    state?: Record<string, any>;
    utils?: Record<string, any>;
    csrfToken?: string;
}

export interface AppRequest {
    method: string;
    url: string;
    originalUrl: string;
    path: string;
    headers: Record<string, string>;
    protocol: string;
    hostname?: string;
    query: Record<string, string>;
    params: Record<string, string>;
    body: any;
    session: AppSession;
    user: User | undefined;
    logger: Logger;
    ip?: string;
    socket: { remoteAddress?: string };
    get(name: string): string | undefined;
    header(name: string): string | undefined;
    flash(type: string, message?: string): string[];
}

export class AppResponse {
    locals: AppLocals;
    statusCode = 200;
    response: Response | null = null;

    private readonly headers = new Headers();

    constructor(
        private readonly c: AppContextContext,
        private readonly ctx: AppContext,
    ) {
        this.locals = c.get('locals');
    }

    status(statusCode: number) {
        this.statusCode = statusCode;
        return this;
    }

    set(headers: Record<string, string>) {
        for (const [key, value] of Object.entries(headers)) {
            this.headers.set(key, value);
        }
        return this;
    }

    setHeader(name: string, value: string) {
        this.headers.set(name, value);
        return this;
    }

    json(data: unknown) {
        this.applyHeaders();
        this.response = this.c.json(data, this.statusCode as ContentfulStatusCode);
        return this.response;
    }

    send(data: string | ArrayBuffer | Uint8Array) {
        this.applyHeaders();
        this.response = new Response(data as BodyInit, {
            status: this.statusCode,
            headers: this.headers,
        });
        return this.response;
    }

    render(view: string, options: Record<string, unknown> = {}) {
        this.applyHeaders();
        const html = this.ctx.utils.template.render(view, {
            ...this.locals,
            csrfToken: this.locals.csrfToken ?? '',
            ...options,
        });
        this.response = this.c.html(html, this.statusCode as ContentfulStatusCode);
        return this.response;
    }

    redirect(url: string) {
        this.applyHeaders();
        const statusCode = this.statusCode >= 300 && this.statusCode < 400 ? this.statusCode : 302;
        this.response = this.c.redirect(url, statusCode as 301 | 302 | 303 | 307 | 308);
        return this.response;
    }

    private applyHeaders() {
        for (const [key, value] of this.headers.entries()) {
            this.c.header(key, value);
        }
    }
}

export interface AppEnv {
    Variables: {
        body: any;
        locals: AppLocals;
        session: AppSession;
        sessionChanged: boolean;
        sessionDestroyed: boolean;
        requestId: string;
        user: User | undefined;
        logger: Logger;
    };
}

export type AppContextContext = Context<AppEnv>;
export type AppMiddleware = MiddlewareHandler<AppEnv>;
export type AppHandler = (
    req: AppRequest,
    res: AppResponse,
) => Promise<Response | void> | Response | void;

export type AppHono = Hono<AppEnv>;

export function createHonoApp(): AppHono;
export function createHonoApp(ctx: AppContext): any;
export function createHonoApp(ctx?: AppContext) {
    const app = new Hono<AppEnv>();
    if (!ctx) return app;

    for (const method of ['get', 'post', 'put', 'patch', 'delete'] as const) {
        const original = app[method].bind(app) as any;
        (app as any)[method] = (path: string, ...handlers: Function[]) => {
            const wrappedHandlers = handlers.map((handler) =>
                isHonoMiddleware(handler) ? handler : handle(ctx, handler as AppHandler),
            );
            return original(path, ...wrappedHandlers);
        };
    }

    return app;
}

export function handle(ctx: AppContext, handler: AppHandler) {
    return async (c: AppContextContext) => {
        const req = createAppRequest(c);
        const res = new AppResponse(c, ctx);
        const response = await handler(req, res);
        if (response instanceof Response) {
            return response;
        }
        if (res.response) {
            return res.response;
        }
        return c.body(null, res.statusCode as ContentfulStatusCode);
    };
}

export function honoMiddleware<T extends Function>(handler: T): T {
    (handler as any)[HONO_MIDDLEWARE] = true;
    return handler;
}

function isHonoMiddleware(handler: Function) {
    return Boolean((handler as any)[HONO_MIDDLEWARE]);
}

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

        if (contentType.includes('application/x-www-form-urlencoded')) {
            c.set('body', parseFormBody(await c.req.text()));
            return next();
        }

        if (contentType.includes('multipart/form-data')) {
            const body = await c.req.parseBody({ all: true });
            c.set('body', normalizeParsedBody(body));
            return next();
        }

        c.set('body', {});
        await next();
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

        if (c.get('sessionChanged') || hasSessionData(session)) {
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

export function createAppRequest(c: AppContextContext): AppRequest {
    const url = new URL(c.req.url);
    const headers = Object.fromEntries(
        [...c.req.raw.headers.entries()].map(([key, value]) => [key.toLowerCase(), value]),
    );
    const session = c.get('session');
    const ip = headers['x-forwarded-for']?.split(',')[0]?.trim() || headers['x-real-ip'];

    return {
        method: c.req.method,
        url: url.pathname + url.search,
        originalUrl: url.pathname + url.search,
        path: c.req.path,
        headers,
        protocol: headers['x-forwarded-proto'] || url.protocol.replace(':', ''),
        hostname: headers.host?.split(':')[0],
        query: c.req.query(),
        params: c.req.param(),
        body: c.get('body') ?? {},
        session,
        user: c.get('user'),
        logger: c.get('logger'),
        ip,
        socket: { remoteAddress: ip },
        get(name: string) {
            return headers[name.toLowerCase()];
        },
        header(name: string) {
            return headers[name.toLowerCase()];
        },
        flash(type: string, message?: string) {
            session.flash ??= {};
            if (message != null) {
                session.flash[type] ??= [];
                session.flash[type]!.push(message);
                c.set('sessionChanged', true);
                return session.flash[type]!;
            }

            const messages = session.flash[type] ?? [];
            delete session.flash[type];
            c.set('sessionChanged', true);
            return messages;
        },
    };
}

export function setCurrentUser(c: AppContextContext, user: User | undefined) {
    c.set('user', user);
}

export function renderView(
    ctx: AppContext,
    c: AppContextContext,
    view: string,
    options: Record<string, unknown> = {},
) {
    const locals = c.get('locals');
    return c.html(
        ctx.utils.template.render(view, {
            ...locals,
            csrfToken: locals.csrfToken ?? '',
            ...options,
        }),
    );
}

export function setFlash(c: AppContextContext, type: string, message: string) {
    const session = c.get('session');
    session.flash = {
        ...session.flash,
        [type]: [...(session.flash?.[type] ?? []), message],
    };
    c.set('sessionChanged', true);
}

export function getRequestBaseUrl(c: AppContextContext) {
    const url = new URL(c.req.url);
    const protocol = c.req.header('x-forwarded-proto') || url.protocol.replace(':', '');
    const host = c.req.header('host') || url.host;
    return `${protocol}://${host}`;
}

function createSession(
    ctx: AppContext,
    c: AppContextContext,
    sid: string,
    data: AppSessionData,
): AppSession {
    const session = {
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
    } as AppSession;

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
    const data = { ...session } as Record<string, unknown>;
    delete data.id;
    delete data.save;
    delete data.destroy;
    delete data.regenerate;

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

function hasSessionData(session: AppSession) {
    const ignored = new Set(['id', 'save', 'destroy', 'regenerate']);
    for (const key of Object.keys(session)) {
        if (!ignored.has(key)) return true;
    }
    return false;
}

function parseFormBody(rawBody: string) {
    const params = new URLSearchParams(rawBody);
    const body: Record<string, any> = {};
    for (const [rawKey, value] of params.entries()) {
        assignFormValue(body, rawKey, value);
    }
    return body;
}

function normalizeParsedBody(rawBody: Record<string, unknown>) {
    const body: Record<string, any> = {};
    for (const [key, value] of Object.entries(rawBody)) {
        assignFormValue(body, key, value);
    }
    return body;
}

function assignFormValue(body: Record<string, any>, rawKey: string, value: unknown) {
    const parts = rawKey
        .replace(/\]/g, '')
        .split('[')
        .filter((part) => part.length > 0);

    if (parts.length === 0) return;
    if (rawKey.endsWith('[]') && parts.length === 1) {
        body[parts[0]!] ??= [];
        body[parts[0]!].push(value);
        return;
    }

    let current = body;
    for (let i = 0; i < parts.length; i++) {
        const part = parts[i]!;
        const isLast = i === parts.length - 1;
        if (isLast) {
            if (current[part] == null) {
                current[part] = value;
            } else if (Array.isArray(current[part])) {
                current[part].push(value);
            } else {
                current[part] = [current[part], value];
            }
            continue;
        }

        current[part] ??= {};
        current = current[part];
    }
}

export function getViewPath(view: string) {
    return './' + path.normalize(view).replace(/\\/g, '/');
}
