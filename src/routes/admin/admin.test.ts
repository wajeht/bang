import {
    cleanupTestData,
    authenticateAgent,
    cleanupTestDatabase,
    ensureTestUserExists,
} from '../../tests/api-test-utils';
import request from 'supertest';
import { createApp } from '../../app';
import { db } from '../../tests/test-setup';
import { describe, it, expect, beforeAll, afterEach, afterAll, beforeEach } from 'vitest';

describe('Admin Routes', () => {
    let app: any;

    beforeAll(async () => {
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
        describe('POST /admin/users/delete', () => {
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
                    .post('/admin/users/delete')
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
                    .post('/admin/users/delete')
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
                    .post('/admin/users/delete')
                    .send({ id: ['1', '2'] })
                    .expect(401);
            });

            it('should require id array', async () => {
                const adminUser = await ensureTestUserExists('admin@example.com');
                await db('users').where({ id: adminUser.id }).update({ is_admin: 1 });

                const { agent } = await authenticateAgent(app, 'admin@example.com');

                await agent.post('/admin/users/delete').type('form').send({}).expect(302);
            });
        });
    });

    describe('Identity Settings', () => {
        beforeEach(async () => {
            await db('settings')
                .insert({ key: 'branding.app_name', value: 'Bang' })
                .onConflict('key')
                .merge();
            await db('settings')
                .insert({ key: 'branding.app_url', value: '' })
                .onConflict('key')
                .merge();
        });

        describe('GET /admin/settings/identity', () => {
            it('should require authentication', async () => {
                await request(app)
                    .get('/admin/settings/identity')
                    .expect(302)
                    .expect('Location', '/?modal=login');
            });

            it('should require admin privileges', async () => {
                const { agent } = await authenticateAgent(app);
                await agent.get('/admin/settings/identity').expect(401);
            });

            it('should show identity settings for admin', async () => {
                const adminUser = await ensureTestUserExists('admin@example.com');
                await db('users').where({ id: adminUser.id }).update({ is_admin: 1 });

                const { agent } = await authenticateAgent(app, 'admin@example.com');

                const response = await agent.get('/admin/settings/identity').expect(200);
                expect(response.text).toContain('Identity');
                expect(response.text).toContain('App Name');
                expect(response.text).toContain('App URL');
            });
        });

        describe('POST /admin/settings/identity', () => {
            it('should require admin privileges', async () => {
                const { agent } = await authenticateAgent(app);
                await agent
                    .post('/admin/settings/identity')
                    .send({ app_name: 'Test', app_url: 'https://test.com' })
                    .expect(401);
            });

            it('should update identity settings', async () => {
                const adminUser = await ensureTestUserExists('admin@example.com');
                await db('users').where({ id: adminUser.id }).update({ is_admin: 1 });

                const { agent } = await authenticateAgent(app, 'admin@example.com');

                await agent
                    .post('/admin/settings/identity')
                    .send({ app_name: 'MyApp', app_url: 'https://myapp.com' })
                    .expect(302)
                    .expect('Location', '/admin/settings/identity');

                const appName = await db('settings').where({ key: 'branding.app_name' }).first();
                const appUrl = await db('settings').where({ key: 'branding.app_url' }).first();

                expect(appName?.value).toBe('MyApp');
                expect(appUrl?.value).toBe('https://myapp.com');
            });

            it('should default to Bang if app_name is empty', async () => {
                const adminUser = await ensureTestUserExists('admin@example.com');
                await db('users').where({ id: adminUser.id }).update({ is_admin: 1 });

                const { agent } = await authenticateAgent(app, 'admin@example.com');

                await agent
                    .post('/admin/settings/identity')
                    .send({ app_name: '', app_url: '' })
                    .expect(302);

                const appName = await db('settings').where({ key: 'branding.app_name' }).first();
                expect(appName?.value).toBe('Bang');
            });
        });
    });

    describe('Visibility Settings', () => {
        beforeEach(async () => {
            await db('settings')
                .insert({ key: 'branding.show_footer', value: 'true' })
                .onConflict('key')
                .merge();
            await db('settings')
                .insert({ key: 'branding.show_search_page', value: 'true' })
                .onConflict('key')
                .merge();
            await db('settings')
                .insert({ key: 'branding.show_about_page', value: 'true' })
                .onConflict('key')
                .merge();
        });

        describe('GET /admin/settings/visibility', () => {
            it('should require authentication', async () => {
                await request(app)
                    .get('/admin/settings/visibility')
                    .expect(302)
                    .expect('Location', '/?modal=login');
            });

            it('should require admin privileges', async () => {
                const { agent } = await authenticateAgent(app);
                await agent.get('/admin/settings/visibility').expect(401);
            });

            it('should show visibility settings for admin', async () => {
                const adminUser = await ensureTestUserExists('admin@example.com');
                await db('users').where({ id: adminUser.id }).update({ is_admin: 1 });

                const { agent } = await authenticateAgent(app, 'admin@example.com');

                const response = await agent.get('/admin/settings/visibility').expect(200);
                expect(response.text).toContain('Visibility');
                expect(response.text).toContain('Show Footer');
                expect(response.text).toContain('Show Search Link');
                expect(response.text).toContain('Show About Link');
            });
        });

        describe('POST /admin/settings/visibility', () => {
            it('should require admin privileges', async () => {
                const { agent } = await authenticateAgent(app);
                await agent
                    .post('/admin/settings/visibility')
                    .send({ show_footer: 'on' })
                    .expect(401);
            });

            it('should update visibility settings', async () => {
                const adminUser = await ensureTestUserExists('admin@example.com');
                await db('users').where({ id: adminUser.id }).update({ is_admin: 1 });

                const { agent } = await authenticateAgent(app, 'admin@example.com');

                await agent
                    .post('/admin/settings/visibility')
                    .send({
                        show_footer: 'on',
                        show_search_page: 'on',
                        // show_about_page not sent (unchecked)
                    })
                    .expect(302)
                    .expect('Location', '/admin/settings/visibility');

                const showFooter = await db('settings')
                    .where({ key: 'branding.show_footer' })
                    .first();
                const showSearch = await db('settings')
                    .where({ key: 'branding.show_search_page' })
                    .first();
                const showAbout = await db('settings')
                    .where({ key: 'branding.show_about_page' })
                    .first();

                expect(showFooter?.value).toBe('true');
                expect(showSearch?.value).toBe('true');
                expect(showAbout?.value).toBe('false');
            });

            it('should set all to false when none checked', async () => {
                const adminUser = await ensureTestUserExists('admin@example.com');
                await db('users').where({ id: adminUser.id }).update({ is_admin: 1 });

                const { agent } = await authenticateAgent(app, 'admin@example.com');

                await agent.post('/admin/settings/visibility').send({}).expect(302);

                const showFooter = await db('settings')
                    .where({ key: 'branding.show_footer' })
                    .first();
                const showSearch = await db('settings')
                    .where({ key: 'branding.show_search_page' })
                    .first();
                const showAbout = await db('settings')
                    .where({ key: 'branding.show_about_page' })
                    .first();

                expect(showFooter?.value).toBe('false');
                expect(showSearch?.value).toBe('false');
                expect(showAbout?.value).toBe('false');
            });
        });
    });
});
