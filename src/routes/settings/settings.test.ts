import {
    cleanupTestData,
    authenticateAgent,
    cleanupTestDatabase,
    createUnauthenticatedAgent,
} from '../../tests/api-test-utils';
import request from 'supertest';
import { createApp } from '../../app';
import { db } from '../../tests/test-setup';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';

describe('Settings Routes', () => {
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

            const updatedUser = await db('users').where({ id: user.id }).first();
            expect(updatedUser.username).toBe('updateduser');
            expect(updatedUser.default_search_provider).toBe('google');
            expect(updatedUser.autocomplete_search_on_homepage).toBe(1);
        });

        it('should allow updating profile while keeping same username', async () => {
            const { agent, user } = await authenticateAgent(app);

            await agent
                .post('/settings/account')
                .send({
                    username: user.username,
                    email: user.email,
                    default_search_provider: 'google',
                    autocomplete_search_on_homepage: 'on',
                    timezone: 'America/New_York',
                })
                .expect(302);

            const updatedUser = await db('users').where({ id: user.id }).first();
            expect(updatedUser.username).toBe(user.username);
            expect(updatedUser.email).toBe(user.email);
            expect(updatedUser.default_search_provider).toBe('google');
            expect(updatedUser.timezone).toBe('America/New_York');
        });

        it('should validate email format', async () => {
            const { agent, user } = await authenticateAgent(app);

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

            await db('users').insert({
                username: 'existinguser',
                email: 'existing@example.com',
                is_admin: false,
                default_search_provider: 'duckduckgo',
            });

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

            const actions = await db('bangs').where({ user_id: user.id });
            expect(actions).toHaveLength(1);
            expect(actions[0].name).toBe('Test Action');
            expect(actions[0].trigger).toBe('!test');
        });

        it('should handle duplicate actions gracefully', async () => {
            const { agent, user } = await authenticateAgent(app);

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

            const actions = await db('bangs').where({ user_id: user.id, trigger: '!test' });
            expect(actions).toHaveLength(1);
            expect(actions[0].name).toBe('Existing Action');
        });

        it('should import hidden items when user has global password', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('users')
                .where({ id: user.id })
                .update({ hidden_items_password: 'hashed_password' });

            const importData = {
                version: '1.0',
                bookmarks: [
                    {
                        title: 'Public Bookmark',
                        url: 'https://public.com',
                        hidden: false,
                    },
                    {
                        title: 'Hidden Bookmark',
                        url: 'https://secret.com',
                        hidden: true,
                    },
                ],
                notes: [
                    {
                        title: 'Public Note',
                        content: 'Public content',
                        hidden: false,
                    },
                    {
                        title: 'Hidden Note',
                        content: 'Secret content',
                        hidden: true,
                    },
                ],
                actions: [
                    {
                        trigger: '!public',
                        name: 'Public Action',
                        url: 'https://public-action.com',
                        action_type: 'redirect',
                        hidden: false,
                    },
                    {
                        trigger: '!hidden',
                        name: 'Hidden Action',
                        url: 'https://secret-action.com',
                        action_type: 'redirect',
                        hidden: true,
                    },
                ],
            };

            await agent
                .post('/settings/data/import')
                .send({
                    config: JSON.stringify(importData),
                })
                .expect(302);

            const bookmarks = await db('bookmarks').where({ user_id: user.id }).orderBy('title');
            expect(bookmarks).toHaveLength(2);
            expect(bookmarks[0].title).toBe('Hidden Bookmark');
            expect(bookmarks[0].hidden).toBe(1);
            expect(bookmarks[1].title).toBe('Public Bookmark');
            expect(bookmarks[1].hidden).toBe(0);

            const notes = await db('notes').where({ user_id: user.id }).orderBy('title');
            expect(notes).toHaveLength(2);
            expect(notes[0].title).toBe('Hidden Note');
            expect(notes[0].hidden).toBe(1);
            expect(notes[1].title).toBe('Public Note');
            expect(notes[1].hidden).toBe(0);

            const actions = await db('bangs').where({ user_id: user.id }).orderBy('trigger');
            expect(actions).toHaveLength(2);
            expect(actions[0].trigger).toBe('!hidden');
            expect(actions[0].hidden).toBe(1);
            expect(actions[1].trigger).toBe('!public');
            expect(actions[1].hidden).toBe(0);
        });

        it('should set hidden to false if not specified in import', async () => {
            const { agent, user } = await authenticateAgent(app);

            const importData = {
                version: '1.0',
                bookmarks: [
                    {
                        title: 'No Hidden Field',
                        url: 'https://example.com',
                    },
                ],
                notes: [
                    {
                        title: 'No Hidden Field Note',
                        content: 'Some content',
                    },
                ],
                actions: [
                    {
                        trigger: '!nohidden',
                        name: 'No Hidden Field Action',
                        url: 'https://example.com',
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

            const bookmarks = await db('bookmarks').where({ user_id: user.id });
            expect(bookmarks[0].hidden).toBe(0);

            const notes = await db('notes').where({ user_id: user.id });
            expect(notes[0].hidden).toBe(0);

            const actions = await db('bangs').where({ user_id: user.id });
            expect(actions[0].hidden).toBe(0);
        });

        it('should update session when importing user preferences', async () => {
            const { agent, user } = await authenticateAgent(app);

            const importData = {
                version: '1.0',
                user_preferences: {
                    default_search_provider: 'google',
                    timezone: 'America/Los_Angeles',
                },
            };

            await agent
                .post('/settings/data/import')
                .send({ config: JSON.stringify(importData) })
                .expect(302);

            const response = await agent.get('/settings/account').expect(200);
            expect(response.text).toContain('"default_search_provider":"google"');
            expect(response.text).toContain('"timezone":"America/Los_Angeles"');
        });
    });

    describe('POST /settings/data/export', () => {
        it('should export data including hidden field', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('users')
                .where({ id: user.id })
                .update({ hidden_items_password: 'hashed_password' });

            await db('bookmarks').insert([
                {
                    user_id: user.id,
                    title: 'Public Bookmark',
                    url: 'https://public.com',
                    hidden: false,
                },
                {
                    user_id: user.id,
                    title: 'Hidden Bookmark',
                    url: 'https://secret.com',
                    hidden: true,
                },
            ]);

            await db('notes').insert([
                {
                    user_id: user.id,
                    title: 'Public Note',
                    content: 'Public content',
                    hidden: false,
                },
                {
                    user_id: user.id,
                    title: 'Hidden Note',
                    content: 'Secret content',
                    hidden: true,
                },
            ]);

            await db('bangs').insert([
                {
                    user_id: user.id,
                    trigger: '!public',
                    name: 'Public Action',
                    url: 'https://public-action.com',
                    action_type: 'redirect',
                    hidden: false,
                },
                {
                    user_id: user.id,
                    trigger: '!hidden',
                    name: 'Hidden Action',
                    url: 'https://secret-action.com',
                    action_type: 'redirect',
                    hidden: true,
                },
            ]);

            const response = await agent
                .post('/settings/data/export')
                .send({
                    options: ['bookmarks', 'notes', 'actions'],
                })
                .expect(200);

            const exportData = JSON.parse(response.text);

            expect(exportData.bookmarks).toHaveLength(2);
            const publicBookmark = exportData.bookmarks.find(
                (b: any) => b.title === 'Public Bookmark',
            );
            const hiddenBookmark = exportData.bookmarks.find(
                (b: any) => b.title === 'Hidden Bookmark',
            );
            expect(publicBookmark.hidden).toBe(0);
            expect(hiddenBookmark.hidden).toBe(1);

            expect(exportData.notes).toHaveLength(2);
            const publicNote = exportData.notes.find((n: any) => n.title === 'Public Note');
            const hiddenNote = exportData.notes.find((n: any) => n.title === 'Hidden Note');
            expect(publicNote.hidden).toBe(0);
            expect(hiddenNote.hidden).toBe(1);

            expect(exportData.actions).toHaveLength(2);
            const publicAction = exportData.actions.find((a: any) => a.trigger === '!public');
            const hiddenAction = exportData.actions.find((a: any) => a.trigger === '!hidden');
            expect(publicAction.hidden).toBe(0);
            expect(hiddenAction.hidden).toBe(1);
        });
    });

    describe('POST /settings/hidden-password', () => {
        it('should require authentication', async () => {
            const agent = await createUnauthenticatedAgent(app);
            await agent
                .post('/settings/hidden-password')
                .send({ newPassword: 'test1234' })
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should set a new password and update the session', async () => {
            const { agent, user } = await authenticateAgent(app);

            await agent
                .post('/settings/hidden-password')
                .send({ newPassword: 'test1234' })
                .expect(302);

            const updatedUser = await db('users').where({ id: user.id }).first();
            expect(updatedUser.hidden_items_password).not.toBeNull();

            const response = await agent.get('/settings/account').expect(200);
            expect(response.text).toContain('Current Password');
            expect(response.text).toContain('Update Password');
        });

        it('should update password and update the session', async () => {
            const { agent, user } = await authenticateAgent(app);
            const bcrypt = await import('bcrypt');

            await agent
                .post('/settings/hidden-password')
                .send({ newPassword: 'oldpass' })
                .expect(302);

            await agent
                .post('/settings/hidden-password')
                .send({
                    currentPassword: 'oldpass',
                    newPassword: 'newpass1234',
                    confirmPassword: 'newpass1234',
                })
                .expect(302);

            const updatedUser = await db('users').where({ id: user.id }).first();
            const isNewPassword = await bcrypt.compare(
                'newpass1234',
                updatedUser.hidden_items_password,
            );
            expect(isNewPassword).toBe(true);
        });

        it('should remove password and update the session', async () => {
            const { agent, user } = await authenticateAgent(app);

            await agent
                .post('/settings/hidden-password')
                .send({ newPassword: 'testpass' })
                .expect(302);

            await agent
                .post('/settings/hidden-password')
                .send({
                    currentPassword: 'testpass',
                    removePassword: 'on',
                })
                .expect(302);

            const updatedUser = await db('users').where({ id: user.id }).first();
            expect(updatedUser.hidden_items_password).toBeNull();

            const response = await agent.get('/settings/account').expect(200);
            expect(response.text).toContain('Set Password');
            expect(response.text).not.toContain('Update Password');
        });

        it('should sync hidden_items_password to session after setting', async () => {
            const { agent } = await authenticateAgent(app);

            const responseBefore = await agent.get('/settings/account').expect(200);
            expect(responseBefore.text).toContain('"hidden_items_password":null');

            await agent
                .post('/settings/hidden-password')
                .send({ newPassword: 'newpass123' })
                .expect(302);

            const responseAfter = await agent.get('/settings/account').expect(200);
            expect(responseAfter.text).not.toContain('"hidden_items_password":null');
            expect(responseAfter.text).toMatch(/"hidden_items_password":"\$2[aby]\$/);
        });
    });

    describe('POST /settings/create-api-key', () => {
        it('should require authentication', async () => {
            const agent = await createUnauthenticatedAgent(app);
            await agent
                .post('/settings/create-api-key')
                .send({})
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should create an API key and update the database', async () => {
            const { agent, user } = await authenticateAgent(app);

            const initialUser = await db('users').where({ id: user.id }).first();
            expect(initialUser.api_key).toBeNull();
            expect(initialUser.api_key_version).toBe(0);

            await agent
                .post('/settings/create-api-key')
                .send({})
                .expect(302)
                .expect('Location', '/settings/account');

            const updatedUser = await db('users').where({ id: user.id }).first();
            expect(updatedUser.api_key).not.toBeNull();
            expect(updatedUser.api_key_version).toBe(1);
            expect(updatedUser.api_key_created_at).not.toBeNull();
        });

        it('should update session so account page shows API key UI', async () => {
            const { agent } = await authenticateAgent(app);

            await agent.post('/settings/create-api-key').send({}).expect(302);

            const response = await agent.get('/settings/account').expect(200);

            expect(response.text).toContain('view-or-hide-button');
            expect(response.text).toContain('Regenerate');
            expect(response.text).not.toContain('click to generate api key');
        });

        it('should increment api_key_version on regeneration', async () => {
            const { agent, user } = await authenticateAgent(app);

            await agent.post('/settings/create-api-key').send({}).expect(302);

            const firstUser = await db('users').where({ id: user.id }).first();
            expect(firstUser.api_key_version).toBe(1);
            const firstKey = firstUser.api_key;

            await agent.post('/settings/create-api-key').send({}).expect(302);

            const secondUser = await db('users').where({ id: user.id }).first();
            expect(secondUser.api_key_version).toBe(2);
            expect(secondUser.api_key).not.toBe(firstKey);
        });
    });

    describe('GET /api/settings/api-key', () => {
        it('should require authentication', async () => {
            await request(app).get('/api/settings/api-key').expect(401);
        });

        it('should return 404 if user has no API key', async () => {
            const { agent } = await authenticateAgent(app);

            const response = await agent.get('/api/settings/api-key').expect(404);

            expect(response.body.error).toBe('API key not found');
        });

        it('should return API key if user has one', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('users').where({ id: user.id }).update({
                api_key: 'test-api-key-12345',
                api_key_version: 1,
            });

            const response = await agent.get('/api/settings/api-key').expect(200);

            expect(response.body.api_key).toBe('test-api-key-12345');
        });

        it('should return fresh data from database not cached session', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('users').where({ id: user.id }).update({
                api_key: 'initial-key',
                api_key_version: 1,
            });

            const response1 = await agent.get('/api/settings/api-key').expect(200);
            expect(response1.body.api_key).toBe('initial-key');

            await db('users').where({ id: user.id }).update({
                api_key: 'updated-key',
                api_key_version: 2,
            });

            const response2 = await agent.get('/api/settings/api-key').expect(200);
            expect(response2.body.api_key).toBe('updated-key');
        });
    });

    describe('POST /settings/danger-zone/bulk-delete', () => {
        it('should update session when deleting API keys', async () => {
            const { agent, user } = await authenticateAgent(app);

            await agent.post('/settings/create-api-key').send({}).expect(302);

            const userWithKey = await db('users').where({ id: user.id }).first();
            expect(userWithKey.api_key).not.toBeNull();

            await agent
                .post('/settings/danger-zone/bulk-delete')
                .send({ delete_options: ['api_keys'] })
                .expect(302);

            const updatedUser = await db('users').where({ id: user.id }).first();
            expect(updatedUser.api_key).toBeNull();
            expect(updatedUser.api_key_version).toBe(0);

            const response = await agent.get('/settings/account').expect(200);
            expect(response.text).toContain('click to generate api key');
            expect(response.text).not.toContain('Regenerate');
        });

        it('should sync api key fields to session after bulk delete', async () => {
            const { agent } = await authenticateAgent(app);

            await agent.post('/settings/create-api-key').send({}).expect(302);

            const responseWithKey = await agent.get('/settings/account').expect(200);
            expect(responseWithKey.text).toContain('"api_key_version":1');
            expect(responseWithKey.text).not.toContain('"api_key":null');

            await agent
                .post('/settings/danger-zone/bulk-delete')
                .send({ delete_options: ['api_keys'] })
                .expect(302);

            const responseAfterDelete = await agent.get('/settings/account').expect(200);
            expect(responseAfterDelete.text).toContain('"api_key":null');
            expect(responseAfterDelete.text).toContain('"api_key_version":0');
        });
    });
});
