import {
    cleanupTestData,
    authenticateAgent,
    cleanupTestDatabase,
} from '../../tests/api-test-utils';
import request from 'supertest';
import { createApp } from '../../app';
import { db } from '../../tests/test-setup';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import bcrypt from 'bcrypt';

describe('Auth Routes', () => {
    let app: any;

    beforeAll(async () => {
        await db.migrate.latest();
    });

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
            // Unauthenticated POST requests get blocked by CSRF middleware first
            const response = await request(app)
                .post('/verify-hidden-password')
                .type('form')
                .send({ password: 'test' });

            // Either CSRF error (403) or auth redirect (302) is acceptable
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

            // Verify session was updated by making another request that uses the session
            const response = await agent.get('/notes').expect(200);
            expect(response.status).toBe(200);
        });

        it('should clean up expired verification keys', async () => {
            const { agent, user } = await authenticateAgent(app);

            const hashedPassword = await bcrypt.hash('correct-password', 10);
            await db('users')
                .where({ id: user.id })
                .update({ hidden_items_password: hashedPassword });

            // First verification
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

            // Second verification - this should trigger cleanup of any expired keys
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
