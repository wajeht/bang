import { createContext } from '../context.js';
import { db } from '../tests/test-setup.js';
import type { AppContext, HonoContext, AppEnv, User } from '../type.js';
import { createBodyParserMiddleware } from './middleware.js';
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

        app.get('/protected', ctx.middleware.authentication, (c: HonoContext) => {
            return c.json({ ok: true });
        });

        const response = await app.request('http://localhost/protected');

        expect(response.status).toBe(302);
        expect(response.headers.get('location')).toBe('/?modal=login');
    });

    it('authenticates from the Hono session middleware', async () => {
        const user = (await db('users').where({ id: 1 }).first()) as User;
        const app = createMiddlewareApp(ctx);

        app.get('/login-test', (c: HonoContext) => {
            const session = c.get('session');
            session.user = user;
            session.userCachedAt = Date.now();
            session.save();
            return c.json({ ok: true });
        });
        app.get('/protected', ctx.middleware.authentication, (c: HonoContext) => {
            return c.json({ userId: c.get('user')?.id });
        });

        const loginResponse = await app.request('http://localhost/login-test');
        const response = await app.request('http://localhost/protected', {
            headers: { cookie: getCookie(loginResponse) },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ userId: user.id });
    });

    it('does not persist the session again when nothing changed', async () => {
        const app = createMiddlewareApp(ctx);

        app.use('*', ctx.middleware.csrf);
        app.get('/page', (c: HonoContext) => c.json({ ok: true }));

        // first request creates the session (csrf token) and sets the cookie
        const first = await app.request('http://localhost/page');
        expect(first.headers.get('set-cookie')).toBeTruthy();

        // second request changes nothing, so no save and no new cookie
        const second = await app.request('http://localhost/page', {
            headers: { cookie: getCookie(first) },
        });
        expect(second.status).toBe(200);
        expect(second.headers.get('set-cookie')).toBeNull();
    });

    it('parses urlencoded bodies with dot notation and array fields', async () => {
        const app = createMiddlewareApp(ctx);

        app.post('/body', (c: HonoContext) => c.json(c.get('body')));

        const form = new URLSearchParams();
        form.append('username', 'jaw');
        form.append('column_preferences.bookmarks.title', 'on');
        form.append('column_preferences.bookmarks.default_per_page', '10');
        form.append('id[]', '1');
        form.append('id[]', '2');

        const response = await app.request('http://localhost/body', {
            method: 'POST',
            headers: { 'content-type': 'application/x-www-form-urlencoded' },
            body: form.toString(),
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({
            username: 'jaw',
            column_preferences: {
                bookmarks: { title: 'on', default_per_page: '10' },
            },
            id: ['1', '2'],
        });
    });

    it('parses multipart bodies with array fields', async () => {
        const app = createMiddlewareApp(ctx);

        app.post('/body', (c: HonoContext) => c.json(c.get('body')));

        const formData = new FormData();
        formData.append('title', 'hello');
        formData.append('id[]', '3');
        formData.append('id[]', '4');

        const response = await app.request('http://localhost/body', {
            method: 'POST',
            body: formData,
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toEqual({ title: 'hello', id: ['3', '4'] });
    });

    it('rejects unsafe requests without a csrf token', async () => {
        const app = createMiddlewareApp(ctx);

        app.use('*', ctx.middleware.csrf);
        app.get('/form', (c: HonoContext) => {
            return c.json({ csrfToken: c.get('locals').csrfToken });
        });
        app.post('/form', (c: HonoContext) => {
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
        app.get('/form', (c: HonoContext) => {
            return c.json({ csrfToken: c.get('locals').csrfToken });
        });
        app.post('/form', (c: HonoContext) => {
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
        app.get('/', (c: HonoContext) => {
            const locals = c.get('locals');
            const branding = locals.state?.branding as { appName?: string } | undefined;
            return c.json({
                appName: branding?.appName,
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
