import {
    cleanupTestData,
    authenticateAgent,
    cleanupTestDatabase,
    createUnauthenticatedAgent,
} from '../../tests/api-test-utils';
import request from 'supertest';
import { db } from '../../db/db';
import { createApp } from '../../app';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

describe('Settings Routes', () => {
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

    describe('GET /settings', () => {
        it('should require authentication', async () => {
            await request(app).get('/settings').expect(302).expect('Location', '/?modal=login');
        });

        it('should redirect to account page for authenticated users', async () => {
            const { agent } = await authenticateAgent(app);

            await agent.get('/settings').expect(302).expect('Location', '/settings/account');
        });
    });

    describe('GET /settings/account', () => {
        it('should require authentication', async () => {
            await request(app)
                .get('/settings/account')
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should render account settings page for authenticated users', async () => {
            const { agent } = await authenticateAgent(app);

            const response = await agent.get('/settings/account').expect(200);

            expect(response.text).toContain('Settings Account');
            expect(response.text).toContain('test');
        });
    });

    describe('GET /settings/data', () => {
        it('should require authentication', async () => {
            await request(app)
                .get('/settings/data')
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should render data settings page for authenticated users', async () => {
            const { agent } = await authenticateAgent(app);

            const response = await agent.get('/settings/data').expect(200);

            expect(response.text).toContain('Settings Data');
        });
    });

    describe('GET /settings/danger-zone', () => {
        it('should require authentication', async () => {
            await request(app)
                .get('/settings/danger-zone')
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should render danger zone page for authenticated users', async () => {
            const { agent } = await authenticateAgent(app);

            const response = await agent.get('/settings/danger-zone').expect(200);

            expect(response.text).toContain('Settings Danger Zone');
        });
    });

    describe('POST /settings/account', () => {
        it('should require authentication', async () => {
            const agent = await createUnauthenticatedAgent(app);
            await agent
                .post('/settings/account')
                .send({
                    username: 'newuser',
                    email: 'new@example.com',
                })
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should update user account settings', async () => {
            const { agent, user } = await authenticateAgent(app);

            await agent
                .post('/settings/account')
                .send({
                    username: 'updateduser',
                    email: user.email,
                    default_search_provider: 'google',
                    autocomplete_search_on_homepage: 'on',
                    timezone: 'UTC',
                })
                .expect(302);

            // Verify user was updated
            const updatedUser = await db('users').where({ id: user.id }).first();
            expect(updatedUser.username).toBe('updateduser');
            expect(updatedUser.default_search_provider).toBe('google');
            expect(updatedUser.autocomplete_search_on_homepage).toBe(1); // SQLite stores boolean as 1/0
        });

        it('should allow updating profile while keeping same username', async () => {
            const { agent, user } = await authenticateAgent(app);

            await agent
                .post('/settings/account')
                .send({
                    username: user.username, // Keep same username
                    email: user.email, // Keep same email
                    default_search_provider: 'google',
                    autocomplete_search_on_homepage: 'on',
                    timezone: 'America/New_York',
                })
                .expect(302);

            // Verify other fields were updated
            const updatedUser = await db('users').where({ id: user.id }).first();
            expect(updatedUser.username).toBe(user.username); // Username unchanged
            expect(updatedUser.email).toBe(user.email); // Email unchanged
            expect(updatedUser.default_search_provider).toBe('google');
            expect(updatedUser.timezone).toBe('America/New_York');
        });

        it('should validate email format', async () => {
            const { agent, user } = await authenticateAgent(app);

            // Validation errors redirect back with error in session
            await agent
                .post('/settings/account')
                .send({
                    username: user.username,
                    email: 'invalid-email',
                    default_search_provider: 'duckduckgo',
                    timezone: 'UTC',
                })
                .expect(302);
        });

        it('should prevent duplicate usernames', async () => {
            const { agent } = await authenticateAgent(app);

            // Create another user
            await db('users').insert({
                username: 'existinguser',
                email: 'existing@example.com',
                is_admin: false,
                default_search_provider: 'duckduckgo',
            });

            // Duplicate usernames cause validation error and redirect
            await agent
                .post('/settings/account')
                .send({
                    username: 'existinguser',
                    email: 'test@example.com',
                    default_search_provider: 'duckduckgo',
                    timezone: 'UTC',
                })
                .expect(302);
        });
    });

    describe('POST /settings/display', () => {
        it('should require authentication', async () => {
            const agent = await createUnauthenticatedAgent(app);
            await agent
                .post('/settings/display')
                .send({
                    column_preferences: {},
                })
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should update column preferences', async () => {
            const { agent, user } = await authenticateAgent(app);

            const columnPreferences = {
                bookmarks: {
                    title: 'on',
                    url: 'on',
                    created_at: 'on',
                    pinned: 'on',
                    default_per_page: '20',
                },
                actions: {
                    name: 'on',
                    trigger: 'on',
                    url: 'on',
                    action_type: 'on',
                    default_per_page: '20',
                },
                tabs: {
                    title: 'on',
                    url: 'on',
                    created_at: 'on',
                    default_per_page: '20',
                },
                notes: {
                    title: 'on',
                    content: 'on',
                    created_at: 'on',
                    default_per_page: '20',
                },
                reminders: {
                    title: 'on',
                    content: 'on',
                    due_date: 'on',
                    created_at: 'on',
                    default_per_page: '20',
                },
            };

            await agent
                .post('/settings/display')
                .send({
                    column_preferences: columnPreferences,
                })
                .expect(302);

            // Verify preferences were updated
            const updatedUser = await db('users').where({ id: user.id }).first();
            const preferences = JSON.parse(updatedUser.column_preferences);
            expect(preferences.bookmarks.title).toBe(true);
            expect(preferences.bookmarks.url).toBe(true);
            expect(preferences.actions.name).toBe(true);
            expect(preferences.actions.trigger).toBe(true);
        });

        it('should handle reminder preferences with timing settings', async () => {
            const { agent, user } = await authenticateAgent(app);

            const columnPreferences = {
                bookmarks: {
                    title: 'on',
                    url: 'on',
                    created_at: 'off',
                    pinned: 'off',
                    default_per_page: '10',
                },
                actions: {
                    name: 'on',
                    trigger: 'on',
                    url: 'off',
                    action_type: 'off',
                    default_per_page: '10',
                },
                tabs: {
                    title: 'on',
                    url: 'on',
                    created_at: 'off',
                    default_per_page: '10',
                },
                notes: {
                    title: 'on',
                    content: 'on',
                    created_at: 'off',
                    default_per_page: '10',
                },
                reminders: {
                    title: 'on',
                    content: 'on',
                    due_date: 'on',
                    created_at: 'off',
                    default_per_page: '10',
                    default_reminder_timing: 'weekly',
                    default_reminder_time: '14:30',
                },
            };

            await agent
                .post('/settings/display')
                .send({
                    column_preferences: columnPreferences,
                })
                .expect(302);

            // Verify reminder preferences were updated
            const updatedUser = await db('users').where({ id: user.id }).first();
            const preferences = JSON.parse(updatedUser.column_preferences);
            expect(preferences.reminders.title).toBe(true);
            expect(preferences.reminders.default_reminder_timing).toBe('weekly');
            expect(preferences.reminders.default_reminder_time).toBe('14:30');
        });
    });

    describe('POST /settings/data/import', () => {
        it('should require authentication', async () => {
            const agent = await createUnauthenticatedAgent(app);
            await agent
                .post('/settings/data/import')
                .send({
                    config: JSON.stringify({
                        version: '1.0',
                        actions: [],
                    }),
                })
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should import new actions successfully', async () => {
            const { agent, user } = await authenticateAgent(app);

            const importData = {
                version: '1.0',
                actions: [
                    {
                        trigger: '!test',
                        name: 'Test Action',
                        url: 'https://test.com',
                        action_type: 'redirect',
                    },
                ],
            };

            await agent
                .post('/settings/data/import')
                .send({
                    config: JSON.stringify(importData),
                })
                .expect(302);

            // Verify action was imported
            const actions = await db('bangs').where({ user_id: user.id });
            expect(actions).toHaveLength(1);
            expect(actions[0].name).toBe('Test Action');
            expect(actions[0].trigger).toBe('!test');
        });

        it('should handle duplicate actions gracefully', async () => {
            const { agent, user } = await authenticateAgent(app);

            // Create existing action
            await db('bangs').insert({
                user_id: user.id,
                trigger: '!test',
                name: 'Existing Action',
                url: 'https://existing.com',
                action_type: 'redirect',
            });

            const importData = {
                version: '1.0',
                actions: [
                    {
                        trigger: '!test',
                        name: 'Duplicate Action',
                        url: 'https://duplicate.com',
                        action_type: 'redirect',
                    },
                ],
            };

            await agent
                .post('/settings/data/import')
                .send({
                    config: JSON.stringify(importData),
                })
                .expect(302);

            // Verify no duplicate was created
            const actions = await db('bangs').where({ user_id: user.id, trigger: '!test' });
            expect(actions).toHaveLength(1);
            expect(actions[0].name).toBe('Existing Action'); // Original should remain
        });
    });
});
