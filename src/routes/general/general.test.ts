import {
    cleanupTestData,
    authenticateAgent,
    authenticateAdminAgent,
    cleanupTestDatabase,
    getSharedApp,
} from '../../tests/api-test-utils';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterEach, afterAll } from 'vitest';

describe('General Routes', () => {
    let app: any;

    beforeAll(async () => {
        ({ app } = await getSharedApp());
    });

    afterEach(async () => {
        await cleanupTestData();
    });

    afterAll(async () => {
        await cleanupTestDatabase();
    });

    describe('GET /', () => {
        it('should return home page', async () => {
            const response = await request(app).get('/').expect(200);

            expect(response.text).toContain('Bang');
        });

        it('should show home page for authenticated users', async () => {
            const { agent } = await authenticateAgent(app);

            const response = await agent.get('/').expect(200);
            expect(response.text).toContain('Bang');
        });
    });

    describe('GET /healthz', () => {
        it('should return 200 status when database is connected (JSON response)', async () => {
            const response = await request(app)
                .get('/healthz')
                .set('Content-Type', 'application/json')
                .expect(200);

            expect(response.headers['content-type']).toMatch(/application\/json/);
            expect(response.body).toHaveProperty('status', 'ok');
            expect(response.body).toHaveProperty('database', 'connected');
        });

        it('should return 200 status when database is connected (HTML response)', async () => {
            const response = await request(app)
                .get('/healthz')
                .set('Accept', 'text/html')
                .expect(200);

            expect(response.text).toContain('ok');
        });
    });

    describe('GET /search', () => {
        it('should redirect to search results', async () => {
            await request(app).get('/search').query({ q: 'test query' }).expect(302);
        });

        it('should handle empty search query', async () => {
            await request(app).get('/search').expect(302);
        });
    });

    describe('GET /metrics', () => {
        it('should redirect unauthenticated requests to login', async () => {
            const response = await request(app).get('/metrics').expect(302);
            expect(response.headers.location).toContain('login');
        });

        it('should return 401 for non-admin users', async () => {
            const { agent } = await authenticateAgent(app);
            await agent.get('/metrics').expect(401);
        });

        it('should return metrics for admin users', async () => {
            const { agent } = await authenticateAdminAgent(app);
            const response = await agent.get('/metrics').expect(200);

            expect(response.body).toHaveProperty('memory');
            expect(response.body.memory).toHaveProperty('rss');
            expect(response.body.memory).toHaveProperty('heapTotal');
            expect(response.body.memory).toHaveProperty('heapUsed');
            expect(response.body.memory).toHaveProperty('external');

            expect(response.body).toHaveProperty('cpu');
            expect(response.body.cpu).toHaveProperty('user');
            expect(response.body.cpu).toHaveProperty('system');

            expect(response.body).toHaveProperty('process');
            expect(response.body.process).toHaveProperty('uptime');
            expect(response.body.process).toHaveProperty('pid');
            expect(response.body.process).toHaveProperty('nodeVersion');

            expect(response.body).toHaveProperty('env');
        });
    });

    describe('Error handling', () => {
        it('should return 404 for non-existent routes', async () => {
            await request(app).get('/non-existent-route').expect(404);
        });
    });
});
