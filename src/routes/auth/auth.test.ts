import {
    cleanupTestData,
    authenticateAgent,
    cleanupTestDatabase,
} from '../../tests/api-test-utils';
import request from 'supertest';
import { createApp } from '../../app';
import { db } from '../../tests/test-setup';
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';
import bcrypt from 'bcrypt';

describe('Auth Routes', () => {
    let app: any;

    beforeEach(async () => {
        const { app: expressApp } = await createApp();
        app = expressApp;
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

            const hashedPassword = await bcrypt.hash('correct-password', 10);
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

            const hashedPassword = await bcrypt.hash('correct-password', 10);
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

            const hashedPassword = await bcrypt.hash('correct-password', 10);
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

            const hashedPassword = await bcrypt.hash('correct-password', 10);
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
            const { ctx } = await createApp();

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
            const { ctx } = await createApp();

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
    });

    describe('Open Redirect Protection', () => {
        it('should convert external URLs to safe local paths', async () => {
            const { agent, user } = await authenticateAgent(app);

            const hashedPassword = await bcrypt.hash('correct-password', 10);
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

            const hashedPassword = await bcrypt.hash('correct-password', 10);
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

            const hashedPassword = await bcrypt.hash('correct-password', 10);
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
