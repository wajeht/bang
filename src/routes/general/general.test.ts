import {
    cleanupTestData,
    authenticateAgent,
    cleanupTestDatabase,
} from '../../tests/api-test-utils';
import request from 'supertest';
import { db } from '../../db/db';
import { createApp } from '../../app';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

describe('General Routes', () => {
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

    describe('Error handling', () => {
        it('should return 404 for non-existent routes', async () => {
            await request(app).get('/non-existent-route').expect(404);
        });
    });
});
