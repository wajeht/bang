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
});
