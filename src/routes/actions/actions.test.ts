import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import { db } from '../../db/db';
import { createApp } from '../../app';
import {
    authenticateAgent,
    authenticateApiAgent,
    cleanupTestData,
    cleanupTestDatabase,
} from '../../tests/api-test-utils';

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

            // Create test data
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
            const { agent, user } = await authenticateApiAgent(app);

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
});
