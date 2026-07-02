import { createContext } from '../context.js';
import { createBodyParserMiddleware, createHonoApp } from '../http.js';
import { db } from '../tests/test-setup.js';
import type { AppRequest, AppResponse } from '../http.js';
import type { AppContext, User } from '../type.js';
import { describe, it, expect, beforeAll } from 'vite-plus/test';

function getCookie(response: Response) {
    return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

function createMiddlewareApp(ctx: AppContext) {
    const app = createHonoApp(ctx);
    app.use('*', ctx.middleware.session);
    app.use('*', ctx.middleware.requestLogger);
    app.use('*', createBodyParserMiddleware());
    app.onError(ctx.middleware.errorHandler);
    return app;
}

describe('middleware', () => {
    let ctx: AppContext;

    beforeAll(async () => {
        ctx = await createContext();
    });

    it('redirects unauthenticated HTML requests to login', async () => {
        const app = createMiddlewareApp(ctx);

        app.get(
            '/protected',
            ctx.middleware.authentication,
            (_req: AppRequest, res: AppResponse) => {
                return res.json({ ok: true });
            },
        );

        const response = await app.request('http://localhost/protected');

        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('/?modal=login');
    });

    it('authenticates from the Hono session middleware', async () => {
        const user = (await db('users').where({ id: 1 }).first()) as User;
        const app = createMiddlewareApp(ctx);

        app.get('/login-test', (req: AppRequest, res: AppResponse) => {
            req.session.user = user;
            req.session.userCachedAt = Date.now();
            return res.json({ ok: true });
        });
        app.get(
            '/protected',
            ctx.middleware.authentication,
            (req: AppRequest, res: AppResponse) => {
                return res.json({ userId: req.user?.id });
            },
        );

        const loginResponse = await app.request('http://localhost/login-test');
        const response = await app.request('http://localhost/protected', {
            headers: { cookie: getCookie(loginResponse) },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ userId: user.id });
    });

    it('rejects unsafe requests without a csrf token', async () => {
        const app = createMiddlewareApp(ctx);

        app.use('*', ctx.middleware.csrf);
        app.get('/form', (_req: AppRequest, res: AppResponse) => {
            return res.json({ csrfToken: res.locals.csrfToken });
        });
        app.post('/form', (_req: AppRequest, res: AppResponse) => {
            return res.json({ ok: true });
        });

        const formResponse = await app.request('http://localhost/form');
        const response = await app.request('http://localhost/form', {
            method: 'POST',
            headers: { cookie: getCookie(formResponse) },
        });

        expect(response.status).toBe(403);
    });

    it('allows unsafe requests with a csrf token', async () => {
        const app = createMiddlewareApp(ctx);

        app.use('*', ctx.middleware.csrf);
        app.get('/form', (_req: AppRequest, res: AppResponse) => {
            return res.json({ csrfToken: res.locals.csrfToken });
        });
        app.post('/form', (_req: AppRequest, res: AppResponse) => {
            return res.json({ ok: true });
        });

        const formResponse = await app.request('http://localhost/form');
        const cookie = getCookie(formResponse);
        const { csrfToken } = await formResponse.json();
        const response = await app.request('http://localhost/form', {
            method: 'POST',
            headers: { cookie, 'x-csrf-token': csrfToken },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ ok: true });
    });

    it('builds template locals for HTML requests', async () => {
        const app = createMiddlewareApp(ctx);

        app.use('*', ctx.middleware.csrf);
        app.use('*', ctx.middleware.appLocalState);
        app.get('/', (_req: AppRequest, res: AppResponse) => {
            return res.json({
                appName: res.locals.state?.branding?.appName,
                csrfToken: res.locals.csrfToken,
            });
        });

        const response = await app.request('http://localhost/');

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            appName: 'Bang',
            csrfToken: expect.any(String),
        });
    });
});
