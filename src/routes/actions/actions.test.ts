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
});
