import {
    cleanupTestData,
    authenticateAgent,
    cleanupTestDatabase,
    getSharedApp,
} from '../../tests/api-test-utils';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { db } from '../../tests/test-setup';
import type { AppContext } from '../../type';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';

describe('Auth Routes', () => {
    let app: any;
    let ctx: AppContext;
    let preHashedPassword: string;

    beforeAll(async () => {
        ({ app, ctx } = await getSharedApp());
        // Pre-hash password once with low cost for tests (bcrypt cost 4 is ~16x faster than cost 10)
        preHashedPassword = await bcrypt.hash('correct-password', 4);
    });

    afterEach(async () => {
        await cleanupTestData();
    });

    afterAll(async () => {
        await cleanupTestDatabase();
    });

    describe('POST /verify-hidden-password', () => {
        it('should require authentication', async () => {
            const response = await request(app)
                .post('/verify-hidden-password')
                .type('form')
                .send({ password: 'test' });

            expect([302, 403]).toContain(response.status);
        });

        it('should return error if no password provided', async () => {
            const { agent } = await authenticateAgent(app);

            const response = await agent
                .post('/verify-hidden-password')
                .type('form')
                .send({ redirect_url: '/bookmarks' })
                .expect(302);

            expect(response.headers.location).toContain('verify-password-modal=true');
        });

        it('should return error if no hidden_items_password set', async () => {
            const { agent } = await authenticateAgent(app);

            const response = await agent
                .post('/verify-hidden-password')
                .type('form')
                .send({ password: 'test', redirect_url: '/bookmarks' })
                .expect(302);

            expect(response.headers.location).toContain('verify-password-modal=true');
        });

        it('should return error if password is invalid', async () => {
            const { agent, user } = await authenticateAgent(app);

            const hashedPassword = preHashedPassword;
            await db('users')
                .where({ id: user.id })
                .update({ hidden_items_password: hashedPassword });

            const response = await agent
                .post('/verify-hidden-password')
                .type('form')
                .send({ password: 'wrong-password', redirect_url: '/bookmarks' })
                .expect(302);

            expect(response.headers.location).toContain('verify-password-modal=true');
        });

        it('should verify password and redirect on success', async () => {
            const { agent, user } = await authenticateAgent(app);

            const hashedPassword = preHashedPassword;
            await db('users')
                .where({ id: user.id })
                .update({ hidden_items_password: hashedPassword });

            const response = await agent
                .post('/verify-hidden-password')
                .type('form')
                .send({
                    password: 'correct-password',
                    redirect_url: '/bookmarks?hidden=true',
                })
                .expect(302);

            expect(response.headers.location).toBe('/bookmarks?hidden=true');
        });

        it('should set verification key with resource type and id', async () => {
            const { agent, user } = await authenticateAgent(app);

            const hashedPassword = preHashedPassword;
            await db('users')
                .where({ id: user.id })
                .update({ hidden_items_password: hashedPassword });

            await agent
                .post('/verify-hidden-password')
                .type('form')
                .send({
                    password: 'correct-password',
                    resource_type: 'note',
                    resource_id: '123',
                    redirect_url: '/notes/123',
                })
                .expect(302);

            const response = await agent.get('/notes').expect(200);
            expect(response.status).toBe(200);
        });

        it('should clean up expired verification keys', async () => {
            const { agent, user } = await authenticateAgent(app);

            const hashedPassword = preHashedPassword;
            await db('users')
                .where({ id: user.id })
                .update({ hidden_items_password: hashedPassword });

            await agent
                .post('/verify-hidden-password')
                .type('form')
                .send({
                    password: 'correct-password',
                    resource_type: 'note',
                    resource_id: '1',
                    redirect_url: '/notes/1',
                })
                .expect(302);

            const response = await agent
                .post('/verify-hidden-password')
                .type('form')
                .send({
                    password: 'correct-password',
                    resource_type: 'bookmark',
                    resource_id: '2',
                    redirect_url: '/bookmarks/2',
                })
                .expect(302);

            expect(response.headers.location).toBe('/bookmarks/2');
        });
    });

    describe('GET /auth/magic/:token', () => {
        it('should authenticate user with valid magic link token', async () => {
            await db('users').insert({
                username: 'magicuser',
                email: 'magic@example.com',
                is_admin: false,
                default_search_provider: 'duckduckgo',
            });

            const token = ctx.utils.auth.generateMagicLink({ email: 'magic@example.com' });

            const response = await request(app).get(`/auth/magic/${token}`).expect(302);

            expect(response.headers.location).toBe('/actions');
        });

        it('should reject invalid magic link token', async () => {
            const response = await request(app).get('/auth/magic/invalid-token').expect(302);

            expect(response.headers.location).toBe('/');
        });

        it('should reject expired magic link token', async () => {
            const response = await request(app)
                .get(
                    '/auth/magic/eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJlbWFpbCI6InRlc3RAZXhhbXBsZS5jb20iLCJpYXQiOjE2MDAwMDAwMDAsImV4cCI6MTYwMDAwMDAwMX0.invalid',
                )
                .expect(302);

            expect(response.headers.location).toBe('/');
        });

        it('should set user session after successful authentication', async () => {
            await db('users').insert({
                username: 'sessionuser',
                email: 'session@example.com',
                is_admin: false,
                default_search_provider: 'duckduckgo',
            });

            const token = ctx.utils.auth.generateMagicLink({ email: 'session@example.com' });

            const agent = request.agent(app);
            await agent.get(`/auth/magic/${token}`).expect(302);

            const protectedResponse = await agent.get('/actions').expect(200);
            expect(protectedResponse.text).toContain('Actions');
        });

        it('should set email_verified_at in session on first login only', async () => {
            const [user] = await db('users')
                .insert({
                    username: 'verifyuser',
                    email: 'verify@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                    email_verified_at: null,
                })
                .returning('*');

            expect(user.email_verified_at).toBeNull();

            const token1 = ctx.utils.auth.generateMagicLink({ email: 'verify@example.com' });

            const agent = request.agent(app);
            await agent.get(`/auth/magic/${token1}`).expect(302);

            const response = await agent.get('/settings/account').expect(200);
            expect(response.text).toContain('"email_verified_at"');
            expect(response.text).not.toContain('"email_verified_at":null');

            const verifiedUser = await db('users').where({ id: user.id }).first();
            expect(verifiedUser.email_verified_at).not.toBeNull();
            const firstVerificationTime = verifiedUser.email_verified_at;

            const token2 = ctx.utils.auth.generateMagicLink({ email: 'verify@example.com' });
            await agent.get(`/auth/magic/${token2}`).expect(302);

            const userAfterSecondLogin = await db('users').where({ id: user.id }).first();
            expect(userAfterSecondLogin.email_verified_at).toBe(firstVerificationTime);
        });
    });

    describe('Open Redirect Protection', () => {
        it('should convert external URLs to safe local paths', async () => {
            const { agent, user } = await authenticateAgent(app);

            const hashedPassword = preHashedPassword;
            await db('users')
                .where({ id: user.id })
                .update({ hidden_items_password: hashedPassword });

            const response = await agent
                .post('/verify-hidden-password')
                .type('form')
                .send({
                    password: 'correct-password',
                    redirect_url: 'https://evil.com/steal-cookies',
                })
                .expect(302);

            expect(response.headers.location).toBe('/evil.com/steal-cookies');
            expect(response.headers.location).not.toMatch(/^\/\//);
        });

        it('should prevent protocol-relative URL redirects', async () => {
            const { agent, user } = await authenticateAgent(app);

            const hashedPassword = preHashedPassword;
            await db('users')
                .where({ id: user.id })
                .update({ hidden_items_password: hashedPassword });

            const response = await agent
                .post('/verify-hidden-password')
                .type('form')
                .send({
                    password: 'correct-password',
                    redirect_url: '//evil.com/steal-cookies',
                })
                .expect(302);

            expect(response.headers.location).toBe('/evil.com/steal-cookies');
            expect(response.headers.location).not.toMatch(/^\/\//);
        });

        it('should handle relative paths correctly', async () => {
            const { agent, user } = await authenticateAgent(app);

            const hashedPassword = preHashedPassword;
            await db('users')
                .where({ id: user.id })
                .update({ hidden_items_password: hashedPassword });

            const response = await agent
                .post('/verify-hidden-password')
                .type('form')
                .send({
                    password: 'correct-password',
                    redirect_url: '/bookmarks?hidden=true',
                })
                .expect(302);

            expect(response.headers.location).toBe('/bookmarks?hidden=true');
        });
    });

    describe('GET /logout', () => {
        it('should log out user and redirect to home', async () => {
            const { agent } = await authenticateAgent(app);

            const response = await agent.get('/logout').expect(302);

            expect(response.headers.location).toContain('toast=');
        });

        it('should work for unauthenticated users', async () => {
            const response = await request(app).get('/logout').expect(302);

            expect(response.headers.location).toContain('toast=');
        });
    });
});
