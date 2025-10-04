import {
    cleanupTestData,
    authenticateAgent,
    cleanupTestDatabase,
    authenticateApiAgent,
} from '../../tests/api-test-utils';
import request from 'supertest';
import { db } from '../../db/db';
import { createApp } from '../../app';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

describe('Actions API', () => {
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
    });

    describe('POST /actions/delete-bulk', () => {
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
                .post('/actions/delete-bulk')
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
                .post('/actions/delete-bulk')
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

            await agent.post('/actions/delete-bulk').type('form').send({}).expect(302);
        });
    });

    describe('POST /api/actions/delete-bulk', () => {
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
                .post('/api/actions/delete-bulk')
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
                .post('/api/actions/delete-bulk')
                .send({ id: [action.id, 99999] })
                .expect(200);

            expect(response.body.data.deletedCount).toBe(1);
        });

        it('should require id to be an array', async () => {
            const { agent } = await authenticateApiAgent(app);

            await agent.post('/api/actions/delete-bulk').send({ id: 'not-an-array' }).expect(422);
        });
    });
});
