import request from 'supertest';
import { db } from '../../db/db';
import type { Server } from 'node:http';
import { createServer, closeServer } from '../../app';
import { createAuthenticatedAgent, cleanupTestData } from '../../tests/api-test-utils';
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';

describe('Admin Routes API Tests', () => {
    let app: any;
    let server: Server;
    let adminUserId: number;
    let regularUserId: number;

    beforeAll(async () => {
        const serverInfo = await createServer();
        app = serverInfo.app;
        server = serverInfo.server;
    });

    afterAll(async () => {
        await closeServer({ server });
    });

    beforeEach(async () => {
        await db('users').where('email', 'admin@example.com').delete();
        await db('users').where('email', 'regular@example.com').delete();

        const [adminUser] = await db('users')
            .insert({
                username: 'adminuser',
                email: 'admin@example.com',
                is_admin: true,
                email_verified_at: db.fn.now(),
            })
            .returning('*');

        adminUserId = adminUser.id;

        const [regularUser] = await db('users')
            .insert({
                username: 'regularuser',
                email: 'regular@example.com',
                is_admin: false,
                email_verified_at: db.fn.now(),
            })
            .returning('*');

        regularUserId = regularUser.id;
    });

    afterEach(async () => {
        await cleanupTestData();
    });

    describe('GET /admin/users', () => {
        it('should return 302 redirect when accessing admin without authentication', async () => {
            const response = await request(app).get('/admin/users');

            expect(response.status).toBe(302);
            expect(response.headers.location).toContain('/?modal=login');
        });

        it('should return 403 when non-admin user tries to access admin page', async () => {
            const { agent } = await createAuthenticatedAgent(app, 'regular@example.com', false);

            const response = await agent.get('/admin/users');

            // Non-admin users should get a 403 Forbidden
            expect(response.status).toBe(403);
        });

        it('should return 200 when admin user accesses admin page', async () => {
            const { agent } = await createAuthenticatedAgent(app, 'admin@example.com', true);

            const response = await agent.get('/admin/users');

            expect(response.status).toBe(200);
            expect(response.type).toMatch(/html/);
        });

        it('should handle pagination parameters correctly', async () => {
            const { agent } = await createAuthenticatedAgent(app, 'admin@example.com', true);

            const response = await agent.get('/admin/users').query({
                page: 2,
                perPage: 10,
                search: 'test',
            });

            expect(response.status).toBe(200);
            expect(response.type).toMatch(/html/);
        });
    });

    describe('POST /admin/users/:id/delete', () => {
        let targetUserId: number;

        beforeEach(async () => {
            const [targetUser] = await db('users')
                .insert({
                    username: 'targetuser',
                    email: 'target@example.com',
                    is_admin: false,
                })
                .returning('*');

            targetUserId = targetUser.id;
        });

        afterEach(async () => {
            await db('users')
                .where({ id: targetUserId })
                .delete()
                .catch(() => {});
        });

        it('should allow admin to delete a user', async () => {
            const { agent, csrfToken } = await createAuthenticatedAgent(app, 'admin@example.com', true);

            const response = await agent
                .post(`/admin/users/${targetUserId}/delete`)
                .send({ csrfToken });

            expect(response.status).toBe(302);
            expect(response.headers.location).toBe('/admin/users');

            const deletedUser = await db('users').where({ id: targetUserId }).first();
            expect(deletedUser).toBeUndefined();
        });

        it('should prevent admin from deleting themselves', async () => {
            const { agent, user, csrfToken } = await createAuthenticatedAgent(app, 'admin@example.com', true);

            const response = await agent
                .post(`/admin/users/${user.id}/delete`)
                .send({ csrfToken });

            expect(response.status).toBe(302);
            expect(response.headers.location).toBe('/admin/users');

            const adminUser = await db('users').where({ id: user.id }).first();
            expect(adminUser).toBeDefined();
        });

        it('should handle non-existent user gracefully', async () => {
            const { agent, csrfToken } = await createAuthenticatedAgent(app, 'admin@example.com', true);

            const response = await agent
                .post('/admin/users/99999/delete')
                .send({ csrfToken });

            expect(response.status).toBe(404);
        });

        it('should delete all user data when deleting a user', async () => {
            await db('bookmarks').insert({
                user_id: targetUserId,
                title: 'Test Bookmark',
                url: 'https://example.com',
            });

            await db('notes').insert({
                user_id: targetUserId,
                title: 'Test Note',
                content: 'Test content',
            });

            await db('bangs').insert({
                user_id: targetUserId,
                trigger: '!test',
                name: 'Test Action',
                url: 'https://test.com',
                action_type: 'redirect',
            });

            const { agent, csrfToken } = await createAuthenticatedAgent(app, 'admin@example.com', true);

            const response = await agent
                .post(`/admin/users/${targetUserId}/delete`)
                .send({ csrfToken });

            expect(response.status).toBe(302);

            const userBookmarks = await db('bookmarks').where({ user_id: targetUserId });
            const userNotes = await db('notes').where({ user_id: targetUserId });
            const userActions = await db('bangs').where({ user_id: targetUserId });

            // All user data should be deleted due to CASCADE
            expect(userBookmarks).toHaveLength(0);
            expect(userNotes).toHaveLength(0);
            expect(userActions).toHaveLength(0);
        });
    });
});
