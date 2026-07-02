import { createContext } from '../context.js';
import type { AppContextContext, AppEnv } from '../http.js';
import { createBodyParserMiddleware } from '../http.js';
import { db } from '../tests/test-setup.js';
import type { AppContext, User } from '../type.js';
import { Hono } from 'hono';
import { describe, it, expect, beforeAll } from 'vite-plus/test';

function getCookie(response: Response) {
    return response.headers.get('set-cookie')?.split(';')[0] ?? '';
}

function createMiddlewareApp(ctx: AppContext) {
    const app = new Hono<AppEnv>();
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

        app.get('/protected', ctx.middleware.authentication, (c: AppContextContext) => {
            return c.json({ ok: true });
        });

        const response = await app.request('http://localhost/protected');

        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('/?modal=login');
    });

    it('authenticates from the Hono session middleware', async () => {
        const user = (await db('users').where({ id: 1 }).first()) as User;
        const app = createMiddlewareApp(ctx);

        app.get('/login-test', (c: AppContextContext) => {
            const session = c.get('session');
            session.user = user;
            session.userCachedAt = Date.now();
            return c.json({ ok: true });
        });
        app.get('/protected', ctx.middleware.authentication, (c: AppContextContext) => {
            return c.json({ userId: c.get('user')?.id });
        });

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
        app.get('/form', (c: AppContextContext) => {
            return c.json({ csrfToken: c.get('locals').csrfToken });
        });
        app.post('/form', (c: AppContextContext) => {
            return c.json({ ok: true });
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
        app.get('/form', (c: AppContextContext) => {
            return c.json({ csrfToken: c.get('locals').csrfToken });
        });
        app.post('/form', (c: AppContextContext) => {
            return c.json({ ok: true });
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
        app.get('/', (c: AppContextContext) => {
            const locals = c.get('locals');
            return c.json({
                appName: locals.state?.branding?.appName,
                csrfToken: locals.csrfToken,
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
