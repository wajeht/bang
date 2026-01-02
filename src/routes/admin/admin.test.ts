import { authenticateAgent, authenticateAdminAgent } from '../../tests/api-test-utils';
import request from 'supertest';
import { db, app } from '../../tests/test-setup';
import { describe, it, expect, beforeEach, beforeAll } from 'vitest';
import { SettingsRepository } from './settings.repository';
import { config } from '../../config';
import { libs } from '../../libs';

describe('Admin Routes', () => {
    describe('GET /admin', () => {
        it('should require authentication', async () => {
            await request(app).get('/admin').expect(302).expect('Location', '/?modal=login');
        });

        it('should require admin privileges', async () => {
            const { agent } = await authenticateAgent(app); // Regular user
            await agent.get('/admin').expect(401);
        });

        it('should allow admin users', async () => {
            const { agent } = await authenticateAdminAgent(app);
            await agent.get('/admin').expect(302).expect('Location', '/admin/users');
        });
    });

    describe('GET /admin/users', () => {
        it('should require admin privileges', async () => {
            const { agent } = await authenticateAgent(app); // Regular user
            await agent.get('/admin/users').expect(401);
        });

        it('should show users list for admin', async () => {
            const { agent } = await authenticateAdminAgent(app);
            const response = await agent.get('/admin/users').expect(200);
            expect(response.text).toContain('Users');
        });
    });

    describe('Bulk Delete', () => {
        describe('POST /admin/users/delete', () => {
            it('should delete multiple non-admin users', async () => {
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

                const { agent } = await authenticateAdminAgent(app);

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

                const { agent } = await authenticateAdminAgent(app);

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
                const { agent } = await authenticateAdminAgent(app);
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
                const { agent } = await authenticateAdminAgent(app);
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
                const { agent } = await authenticateAdminAgent(app);

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
                const { agent } = await authenticateAdminAgent(app);

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
                const { agent } = await authenticateAdminAgent(app);
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
                const { agent } = await authenticateAdminAgent(app);

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
                const { agent } = await authenticateAdminAgent(app);

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

    describe('Branding in Pages', () => {
        beforeEach(async () => {
            await db('settings')
                .insert({ key: 'branding.app_name', value: 'CustomBrand' })
                .onConflict('key')
                .merge();
            await db('settings')
                .insert({ key: 'branding.app_url', value: 'https://custom.example.com' })
                .onConflict('key')
                .merge();
        });

        it('should display custom app name in terms of service page', async () => {
            const response = await request(app).get('/terms-of-service').expect(200);
            expect(response.text).toContain('CustomBrand');
        });

        it('should display custom app name in privacy policy page', async () => {
            const response = await request(app).get('/privacy-policy').expect(200);
            expect(response.text).toContain('CustomBrand');
        });

        it('should display custom app name in page title', async () => {
            const response = await request(app).get('/').expect(200);
            expect(response.text).toContain('<title>');
            expect(response.text).toContain('CustomBrand');
        });
    });
});

describe('SettingsRepository', () => {
    let settingsRepo: ReturnType<typeof SettingsRepository>;

    beforeAll(() => {
        const ctx = { db, config, libs } as any;
        settingsRepo = SettingsRepository(ctx);
    });

    beforeEach(() => {
        settingsRepo.invalidateCache();
    });

    describe('get and set', () => {
        it('should set and get a single setting', async () => {
            await settingsRepo.set('test.key', 'test-value');
            const value = await settingsRepo.get('test.key');
            expect(value).toBe('test-value');
        });

        it('should return null for non-existent key', async () => {
            const value = await settingsRepo.get('nonexistent.key');
            expect(value).toBeNull();
        });

        it('should update existing setting', async () => {
            await settingsRepo.set('test.key', 'initial');
            await settingsRepo.set('test.key', 'updated');
            const value = await settingsRepo.get('test.key');
            expect(value).toBe('updated');
        });
    });

    describe('setMany', () => {
        it('should set multiple settings at once', async () => {
            await settingsRepo.setMany({
                key1: 'value1',
                key2: 'value2',
                key3: 'value3',
            });

            expect(await settingsRepo.get('key1')).toBe('value1');
            expect(await settingsRepo.get('key2')).toBe('value2');
            expect(await settingsRepo.get('key3')).toBe('value3');
        });

        it('should update existing settings in batch', async () => {
            await settingsRepo.set('key1', 'old1');
            await settingsRepo.setMany({
                key1: 'new1',
                key2: 'new2',
            });

            expect(await settingsRepo.get('key1')).toBe('new1');
            expect(await settingsRepo.get('key2')).toBe('new2');
        });
    });

    describe('getAll', () => {
        it('should return all settings as key-value object', async () => {
            await settingsRepo.setMany({
                'branding.app_name': 'TestApp',
                'branding.app_url': 'https://test.com',
            });

            const all = await settingsRepo.getAll();
            expect(all['branding.app_name']).toBe('TestApp');
            expect(all['branding.app_url']).toBe('https://test.com');
        });

        it('should return empty object when no settings exist', async () => {
            const all = await settingsRepo.getAll();
            expect(Object.keys(all).length).toBe(0);
        });
    });

    describe('getBranding', () => {
        it('should return default values when no settings exist', async () => {
            const branding = await settingsRepo.getBranding();

            expect(branding.appName).toBe('Bang');
            expect(branding.appUrl).toBe(config.app.appUrl);
            expect(branding.showFooter).toBe(true);
            expect(branding.showSearchPage).toBe(true);
            expect(branding.showAboutPage).toBe(true);
        });

        it('should return custom values when settings exist', async () => {
            await settingsRepo.setMany({
                'branding.app_name': 'MyCustomApp',
                'branding.app_url': 'https://mycustomapp.com',
                'branding.show_footer': 'false',
                'branding.show_search_page': 'false',
                'branding.show_about_page': 'false',
            });

            const branding = await settingsRepo.getBranding();

            expect(branding.appName).toBe('MyCustomApp');
            expect(branding.appUrl).toBe('https://mycustomapp.com');
            expect(branding.showFooter).toBe(false);
            expect(branding.showSearchPage).toBe(false);
            expect(branding.showAboutPage).toBe(false);
        });

        it('should handle partial settings with defaults', async () => {
            await settingsRepo.set('branding.app_name', 'PartialApp');

            const branding = await settingsRepo.getBranding();

            expect(branding.appName).toBe('PartialApp');
            expect(branding.showFooter).toBe(true);
            expect(branding.showSearchPage).toBe(true);
        });
    });

    describe('cache behavior', () => {
        it('should cache settings after first fetch', async () => {
            await settingsRepo.set('cache.test', 'cached-value');

            const first = await settingsRepo.getAll();
            expect(first['cache.test']).toBe('cached-value');

            await db('settings').where({ key: 'cache.test' }).update({ value: 'db-updated' });

            const second = await settingsRepo.getAll();
            expect(second['cache.test']).toBe('cached-value');
        });

        it('should invalidate cache when set is called', async () => {
            await settingsRepo.set('cache.test', 'initial');
            await settingsRepo.getAll();

            await settingsRepo.set('cache.test', 'updated');

            const result = await settingsRepo.getAll();
            expect(result['cache.test']).toBe('updated');
        });

        it('should invalidate cache when setMany is called', async () => {
            await settingsRepo.set('cache.test', 'initial');
            await settingsRepo.getAll();

            await settingsRepo.setMany({ 'cache.test': 'batch-updated' });

            const result = await settingsRepo.getAll();
            expect(result['cache.test']).toBe('batch-updated');
        });

        it('should invalidate cache when invalidateCache is called', async () => {
            await settingsRepo.set('cache.test', 'initial');
            await settingsRepo.getAll();

            await db('settings').where({ key: 'cache.test' }).update({ value: 'db-updated' });

            settingsRepo.invalidateCache();

            const result = await settingsRepo.getAll();
            expect(result['cache.test']).toBe('db-updated');
        });
    });
});
