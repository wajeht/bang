import {
    cleanupTestData,
    authenticateAgent,
    cleanupTestDatabase,
    ensureTestUserExists,
} from '../../tests/api-test-utils';
import request from 'supertest';
import { db } from '../../db/db';
import { createApp } from '../../app';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

describe('Admin Routes', () => {
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

    describe('GET /admin', () => {
        it('should require authentication', async () => {
            await request(app).get('/admin').expect(302).expect('Location', '/?modal=login');
        });

        it('should require admin privileges', async () => {
            const { agent } = await authenticateAgent(app); // Regular user
            await agent.get('/admin').expect(401);
        });

        it('should allow admin users', async () => {
            // Create admin user
            const adminUser = await ensureTestUserExists('admin@example.com');
            await db('users').where({ id: adminUser.id }).update({ is_admin: 1 });

            const { agent } = await authenticateAgent(app, 'admin@example.com');

            await agent.get('/admin').expect(302).expect('Location', '/admin/users');
        });
    });

    describe('GET /admin/users', () => {
        it('should require admin privileges', async () => {
            const { agent } = await authenticateAgent(app); // Regular user
            await agent.get('/admin/users').expect(401);
        });

        it('should show users list for admin', async () => {
            const adminUser = await ensureTestUserExists('admin@example.com');
            await db('users').where({ id: adminUser.id }).update({ is_admin: 1 });

            const { agent } = await authenticateAgent(app, 'admin@example.com');

            const response = await agent.get('/admin/users').expect(200);
            expect(response.text).toContain('Users');
        });
    });

    describe('Bulk Delete', () => {
        describe('POST /admin/users/delete-bulk', () => {
            it('should delete multiple non-admin users', async () => {
                const adminUser = await ensureTestUserExists('admin@example.com');
                await db('users').where({ id: adminUser.id }).update({ is_admin: 1 });

                const [user1] = await db('users')
                    .insert({
                        username: 'user1',
                        email: 'user1@example.com',
                        is_admin: false,
                        default_search_provider: 'duckduckgo',
                    })
                    .returning('*');

                const [user2] = await db('users')
                    .insert({
                        username: 'user2',
                        email: 'user2@example.com',
                        is_admin: false,
                        default_search_provider: 'duckduckgo',
                    })
                    .returning('*');

                const { agent } = await authenticateAgent(app, 'admin@example.com');

                await agent
                    .post('/admin/users/delete-bulk')
                    .send({ id: [user1.id.toString(), user2.id.toString()] })
                    .expect(302);

                const remainingUser1 = await db('users').where({ id: user1.id }).first();
                const remainingUser2 = await db('users').where({ id: user2.id }).first();

                expect(remainingUser1).toBeUndefined();
                expect(remainingUser2).toBeUndefined();
            });

            it('should not delete admin users', async () => {
                const adminUser = await ensureTestUserExists('admin@example.com');
                await db('users').where({ id: adminUser.id }).update({ is_admin: 1 });

                const [adminUser2] = await db('users')
                    .insert({
                        username: 'admin2',
                        email: 'admin2@example.com',
                        is_admin: true,
                        default_search_provider: 'duckduckgo',
                    })
                    .returning('*');

                const [regularUser] = await db('users')
                    .insert({
                        username: 'regular',
                        email: 'regular@example.com',
                        is_admin: false,
                        default_search_provider: 'duckduckgo',
                    })
                    .returning('*');

                const { agent } = await authenticateAgent(app, 'admin@example.com');

                await agent
                    .post('/admin/users/delete-bulk')
                    .send({ id: [adminUser2.id.toString(), regularUser.id.toString()] })
                    .expect(302);

                const remainingAdminUser2 = await db('users').where({ id: adminUser2.id }).first();
                const remainingRegularUser = await db('users')
                    .where({ id: regularUser.id })
                    .first();

                expect(remainingAdminUser2).toBeDefined();
                expect(remainingRegularUser).toBeUndefined();
            });

            it('should require admin privileges', async () => {
                const { agent } = await authenticateAgent(app);

                await agent
                    .post('/admin/users/delete-bulk')
                    .send({ id: ['1', '2'] })
                    .expect(401);
            });

            it('should require id array', async () => {
                const adminUser = await ensureTestUserExists('admin@example.com');
                await db('users').where({ id: adminUser.id }).update({ is_admin: 1 });

                const { agent } = await authenticateAgent(app, 'admin@example.com');

                await agent.post('/admin/users/delete-bulk').type('form').send({}).expect(302);
            });
        });
    });
});
