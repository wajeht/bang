import {
    cleanupTestData,
    authenticateAgent,
    cleanupTestDatabase,
    authenticateApiAgent,
} from '../../tests/api-test-utils';
import request from 'supertest';
import { createApp } from '../../app';
import { db } from '../../tests/test-setup';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

describe('Actions API', () => {
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

    describe('GET /api/actions', () => {
        it('should require authentication', async () => {
            await request(app).get('/api/actions').expect(401);
        });

        it('should return actions for authenticated user', async () => {
            const { agent, user } = await authenticateApiAgent(app);

            await db('bangs').insert({
                name: 'Google Search',
                trigger: 'g',
                url: 'https://google.com/search?q={{query}}',
                action_type: 'redirect',
                user_id: user.id,
                usage_count: 0,
            });

            const response = await agent.get('/api/actions').expect(200);

            expect(response.headers['content-type']).toMatch(/application\/json/);
            expect(response.body).toHaveProperty('data');
            expect(response.body).toHaveProperty('pagination');
            expect(Array.isArray(response.body.data)).toBe(true);
            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0]).toHaveProperty('name', 'Google Search');
            expect(response.body.data[0]).toHaveProperty('trigger', 'g');
        });

        it('should return empty list when user has no actions', async () => {
            const { agent } = await authenticateApiAgent(app);

            const response = await agent.get('/api/actions').expect(200);

            expect(response.body.data).toHaveLength(0);
            expect(response.body.pagination.total).toBe(0);
        });
    });

    describe('POST /api/actions', () => {
        it('should require authentication', async () => {
            await request(app)
                .post('/api/actions')
                .send({
                    name: 'Test Action',
                    trigger: 'test',
                    url: 'https://example.com',
                })
                .expect(401);
        });

        it('should create a new action', async () => {
            const { agent } = await authenticateApiAgent(app);

            const actionData = {
                name: 'Test Action',
                trigger: 'test',
                url: 'https://example.com/search?q={{query}}',
                actionType: 'search',
            };

            const response = await agent.post('/api/actions').send(actionData).expect(201);

            expect(response.headers['content-type']).toMatch(/application\/json/);
            expect(response.body).toHaveProperty('message');
            expect(response.body.message).toContain('Action !test created successfully!');
        });

        it('should validate required fields', async () => {
            const { agent } = await authenticateApiAgent(app);

            await agent.post('/api/actions').send({}).expect(422);
        });
    });

    describe('Hidden Actions Functionality', () => {
        describe('POST /api/actions - Hidden field', () => {
            it('should reject creating hidden action without global password', async () => {
                const { agent } = await authenticateApiAgent(app);

                const response = await agent
                    .post('/api/actions')
                    .send({
                        name: 'Hidden Action',
                        trigger: '!hidden',
                        url: 'https://secret.com',
                        actionType: 'redirect',
                        hidden: true,
                    })
                    .expect(422);

                expect(response.body.message).toContain('Validation');
            });

            it('should create hidden redirect action with global password', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                const response = await agent
                    .post('/api/actions')
                    .send({
                        name: 'Hidden Action',
                        trigger: '!hidden',
                        url: 'https://secret.com',
                        actionType: 'redirect',
                        hidden: true,
                    })
                    .expect(201);

                expect(response.body.message).toContain('created successfully');

                const action = await db('bangs')
                    .where({ user_id: user.id, trigger: '!hidden' })
                    .first();
                expect(action).toBeDefined();
                expect(action.hidden).toBe(1);
            });

            it('should reject hidden search actions (only redirect actions can be hidden)', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                const response = await agent
                    .post('/api/actions')
                    .send({
                        name: 'Hidden Search',
                        trigger: '!hsearch',
                        url: 'https://example.com/search?q={{query}}',
                        actionType: 'search',
                        hidden: true,
                    })
                    .expect(422);

                expect(response.body.message).toContain('Validation');

                const action = await db('bangs')
                    .where({ user_id: user.id, trigger: '!hsearch' })
                    .first();
                expect(action).toBeUndefined();
            });
        });

        describe('POST /actions/:id/update - Update hidden field', () => {
            it('should allow toggling hidden status with global password', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                const [action] = await db('bangs')
                    .insert({
                        user_id: user.id,
                        name: 'Test Action',
                        trigger: '!test',
                        url: 'https://example.com',
                        action_type: 'redirect',
                        hidden: false,
                    })
                    .returning('*');

                await agent
                    .patch(`/api/actions/${action.id}`)
                    .send({
                        name: 'Test Action',
                        trigger: '!test',
                        url: 'https://example.com',
                        actionType: 'redirect',
                        hidden: true,
                    })
                    .expect(200);

                const updatedAction = await db('bangs').where({ id: action.id }).first();
                expect(updatedAction.hidden).toBe(1);
            });

            it('should reject hiding action without global password', async () => {
                const { agent, user } = await authenticateAgent(app);

                const [action] = await db('bangs')
                    .insert({
                        user_id: user.id,
                        name: 'Test Action',
                        trigger: '!test2',
                        url: 'https://example.com',
                        action_type: 'redirect',
                        hidden: false,
                    })
                    .returning('*');

                await agent
                    .post(`/actions/${action.id}/update`)
                    .type('form')
                    .send({
                        name: 'Test Action',
                        trigger: '!test2',
                        url: 'https://example.com',
                        actionType: 'redirect',
                        hidden: 'on',
                    })
                    .expect(302);

                const action2 = await db('bangs').where({ id: action.id }).first();
                expect(action2.hidden).toBe(0);
            });
        });

        describe('GET /api/actions - Hidden actions exclusion', () => {
            it('should exclude hidden actions from API listing', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                await db('bangs').insert([
                    {
                        user_id: user.id,
                        name: 'Public Action',
                        trigger: '!public',
                        url: 'https://public.com',
                        action_type: 'redirect',
                        hidden: false,
                    },
                    {
                        user_id: user.id,
                        name: 'Hidden Action',
                        trigger: '!hidden2',
                        url: 'https://secret.com',
                        action_type: 'redirect',
                        hidden: true,
                    },
                ]);

                const response = await agent.get('/api/actions').expect(200);

                expect(response.body.data).toHaveLength(1);
                expect(response.body.data[0].trigger).toBe('!public');
            });
        });

        describe('POST /actions/:id/hide - Toggle hidden status', () => {
            it('should toggle hidden status when global password is set', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                const [action] = await db('bangs')
                    .insert({
                        user_id: user.id,
                        name: 'Test Action',
                        trigger: '!test',
                        url: 'https://example.com',
                        action_type: 'redirect',
                        hidden: false,
                    })
                    .returning('*');

                await agent.post(`/actions/${action.id}/hide`).type('form').send({}).expect(302);

                const updatedAction = await db('bangs').where({ id: action.id }).first();
                expect(updatedAction.hidden).toBe(1);

                await agent.post(`/actions/${action.id}/hide`).type('form').send({}).expect(302);

                const unhiddenAction = await db('bangs').where({ id: action.id }).first();
                expect(unhiddenAction.hidden).toBe(0);
            });

            it('should reject hiding action without global password', async () => {
                const { agent, user } = await authenticateAgent(app);

                const [action] = await db('bangs')
                    .insert({
                        user_id: user.id,
                        name: 'Test Action',
                        trigger: '!test',
                        url: 'https://example.com',
                        action_type: 'redirect',
                        hidden: false,
                    })
                    .returning('*');

                await agent.post(`/actions/${action.id}/hide`).type('form').send({}).expect(302);

                const unchangedAction = await db('bangs').where({ id: action.id }).first();
                expect(unchangedAction.hidden).toBe(0);
            });

            it('should reject hiding non-redirect type action', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                const [action] = await db('bangs')
                    .insert({
                        user_id: user.id,
                        name: 'Search Action',
                        trigger: '!search',
                        url: 'https://example.com/search?q={{query}}',
                        action_type: 'search',
                        hidden: false,
                    })
                    .returning('*');

                await agent.post(`/actions/${action.id}/hide`).type('form').send({}).expect(302);

                const unchangedAction = await db('bangs').where({ id: action.id }).first();
                expect(unchangedAction.hidden).toBe(0);
            });

            it('should preserve showHidden query param in redirect', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                const [action] = await db('bangs')
                    .insert({
                        user_id: user.id,
                        name: 'Test Action',
                        trigger: '!test',
                        url: 'https://example.com',
                        action_type: 'redirect',
                        hidden: true,
                    })
                    .returning('*');

                const response = await agent
                    .post(`/actions/${action.id}/hide`)
                    .type('form')
                    .send({ showHidden: 'true' })
                    .expect(302);

                expect(response.headers.location).toBe('/actions?hidden=true');
            });

            it('should return 404 for non-existent action', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                await agent.post('/actions/99999/hide').type('form').send({}).expect(404);
            });
        });

        describe('POST /api/actions/:id/hide - Toggle hidden status via API', () => {
            it('should toggle hidden status via API when global password is set', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                const [action] = await db('bangs')
                    .insert({
                        user_id: user.id,
                        name: 'Test Action',
                        trigger: '!test',
                        url: 'https://example.com',
                        action_type: 'redirect',
                        hidden: false,
                    })
                    .returning('*');

                const response = await agent.post(`/api/actions/${action.id}/hide`).expect(200);

                expect(response.body.message).toContain('hidden successfully');

                const updatedAction = await db('bangs').where({ id: action.id }).first();
                expect(updatedAction.hidden).toBe(1);
            });

            it('should reject hiding via API without global password', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                const [action] = await db('bangs')
                    .insert({
                        user_id: user.id,
                        name: 'Test Action',
                        trigger: '!test',
                        url: 'https://example.com',
                        action_type: 'redirect',
                        hidden: false,
                    })
                    .returning('*');

                const response = await agent.post(`/api/actions/${action.id}/hide`).expect(422);

                expect(response.body.message).toContain('Validation');

                const unchangedAction = await db('bangs').where({ id: action.id }).first();
                expect(unchangedAction.hidden).toBe(0);
            });

            it('should reject hiding non-redirect type action via API', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                const [action] = await db('bangs')
                    .insert({
                        user_id: user.id,
                        name: 'Search Action',
                        trigger: '!search',
                        url: 'https://example.com/search?q={{query}}',
                        action_type: 'search',
                        hidden: false,
                    })
                    .returning('*');

                const response = await agent.post(`/api/actions/${action.id}/hide`).expect(422);

                expect(response.body.message).toContain('Validation');

                const unchangedAction = await db('bangs').where({ id: action.id }).first();
                expect(unchangedAction.hidden).toBe(0);
            });

            it('should return 404 for non-existent action via API', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                await agent.post('/api/actions/99999/hide').expect(404);
            });
        });
    });

    describe('POST /actions/delete', () => {
        it('should delete multiple actions', async () => {
            const { agent, user } = await authenticateAgent(app);

            const actions = await db('bangs')
                .insert([
                    {
                        user_id: user.id,
                        name: 'Action 1',
                        trigger: '!one',
                        url: 'https://one.com',
                        action_type: 'redirect',
                    },
                    {
                        user_id: user.id,
                        name: 'Action 2',
                        trigger: '!two',
                        url: 'https://two.com',
                        action_type: 'search',
                    },
                    {
                        user_id: user.id,
                        name: 'Action 3',
                        trigger: '!three',
                        url: 'https://three.com',
                        action_type: 'redirect',
                    },
                ])
                .returning('*');

            await agent
                .post('/actions/delete')
                .type('form')
                .send({ id: [actions[0].id, actions[1].id] })
                .expect(302);

            const remaining = await db('bangs').where({ user_id: user.id });
            expect(remaining).toHaveLength(1);
            expect(remaining[0].name).toBe('Action 3');
        });

        it('should only delete actions owned by the user', async () => {
            const { agent, user } = await authenticateAgent(app);

            const [otherUser] = await db('users')
                .insert({
                    username: 'otheruser',
                    email: 'other@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                })
                .returning('*');

            const [userAction] = await db('bangs')
                .insert({
                    user_id: user.id,
                    name: 'My Action',
                    trigger: '!mine',
                    url: 'https://mine.com',
                    action_type: 'redirect',
                })
                .returning('*');

            const [otherAction] = await db('bangs')
                .insert({
                    user_id: otherUser.id,
                    name: 'Other Action',
                    trigger: '!other',
                    url: 'https://other.com',
                    action_type: 'redirect',
                })
                .returning('*');

            await agent
                .post('/actions/delete')
                .type('form')
                .send({ id: [userAction.id, otherAction.id] })
                .expect(302);

            const userActions = await db('bangs').where({ user_id: user.id });
            const otherActions = await db('bangs').where({ user_id: otherUser.id });

            expect(userActions).toHaveLength(0);
            expect(otherActions).toHaveLength(1);
        });

        it('should require id array', async () => {
            const { agent } = await authenticateAgent(app);

            await agent.post('/actions/delete').type('form').send({}).expect(302);
        });
    });

    describe('POST /api/actions/delete', () => {
        it('should delete multiple actions via API', async () => {
            const { agent, user } = await authenticateApiAgent(app);

            const actions = await db('bangs')
                .insert([
                    {
                        user_id: user.id,
                        name: 'Action 1',
                        trigger: '!one',
                        url: 'https://one.com',
                        action_type: 'redirect',
                    },
                    {
                        user_id: user.id,
                        name: 'Action 2',
                        trigger: '!two',
                        url: 'https://two.com',
                        action_type: 'search',
                    },
                    {
                        user_id: user.id,
                        name: 'Action 3',
                        trigger: '!three',
                        url: 'https://three.com',
                        action_type: 'redirect',
                    },
                ])
                .returning('*');

            const response = await agent
                .post('/api/actions/delete')
                .send({ id: [actions[0].id, actions[1].id] })
                .expect(200);

            expect(response.body.message).toContain('2 actions deleted successfully');
            expect(response.body.data.deletedCount).toBe(2);

            const remaining = await db('bangs').where({ user_id: user.id });
            expect(remaining).toHaveLength(1);
            expect(remaining[0].name).toBe('Action 3');
        });

        it('should return correct count when some IDs are invalid', async () => {
            const { agent, user } = await authenticateApiAgent(app);

            const [action] = await db('bangs')
                .insert({
                    user_id: user.id,
                    name: 'Action 1',
                    trigger: '!one',
                    url: 'https://one.com',
                    action_type: 'redirect',
                })
                .returning('*');

            const response = await agent
                .post('/api/actions/delete')
                .send({ id: [action.id, 99999] })
                .expect(200);

            expect(response.body.data.deletedCount).toBe(1);
        });

        it('should require id to be an array', async () => {
            const { agent } = await authenticateApiAgent(app);

            await agent.post('/api/actions/delete').send({ id: 'not-an-array' }).expect(422);
        });
    });

    describe('Search Highlighting', () => {
        it('should highlight search terms in name, trigger and url', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('bangs').insert([
                {
                    user_id: user.id,
                    name: 'Google Search',
                    trigger: '!google',
                    url: 'https://google.com/search?q={{{s}}}',
                    action_type: 'redirect',
                },
                {
                    user_id: user.id,
                    name: 'Other Action',
                    trigger: '!other',
                    url: 'https://other.com',
                    action_type: 'redirect',
                },
            ]);

            const response = await agent.get('/actions?search=google').expect(200);

            expect(response.text).toContain('<mark>Google</mark> Search');
            expect(response.text).toContain('!<mark>google</mark>');
            expect(response.text).toContain('https://<mark>google</mark>.com');
            expect(response.text).not.toContain('Other Action');
        });

        it('should highlight multiple search words', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('bangs').insert({
                user_id: user.id,
                name: 'GitHub Code Search',
                trigger: '!ghcode',
                url: 'https://github.com/search?q={{{s}}}',
                action_type: 'redirect',
            });

            const response = await agent.get('/actions?search=github+code').expect(200);

            expect(response.text).toContain('<mark>GitHub</mark>');
            expect(response.text).toContain('<mark>Code</mark>');
        });

        it('should return all results without highlighting when no search term', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('bangs').insert([
                {
                    user_id: user.id,
                    name: 'Action One',
                    trigger: '!one',
                    url: 'https://one.com',
                    action_type: 'redirect',
                },
                {
                    user_id: user.id,
                    name: 'Action Two',
                    trigger: '!two',
                    url: 'https://two.com',
                    action_type: 'redirect',
                },
            ]);

            const response = await agent.get('/actions').expect(200);

            expect(response.text).toContain('Action One');
            expect(response.text).toContain('Action Two');
            expect(response.text).not.toContain('<mark>');
        });

        it('should highlight search terms in API response', async () => {
            const { agent, user } = await authenticateApiAgent(app);

            await db('bangs').insert({
                user_id: user.id,
                name: 'Testing Highlight',
                trigger: '!highlight',
                url: 'https://highlight-test.com',
                action_type: 'redirect',
            });

            const response = await agent.get('/api/actions?search=highlight').expect(200);

            expect(response.body.data[0].name).toContain('<mark>Highlight</mark>');
            expect(response.body.data[0].trigger).toContain('<mark>highlight</mark>');
            expect(response.body.data[0].url).toContain('<mark>highlight</mark>');
        });
    });
});
