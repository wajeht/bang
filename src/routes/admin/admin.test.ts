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
        app = await createApp();
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

            const response = await agent
                .get('/admin')
                .expect(302)
                .expect('Location', '/admin/users');
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
});
