import request from 'supertest';
import type { Server } from 'node:http';
import { createServer, closeServer } from '../../app';
import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createAuthenticatedAgent, cleanupTestData } from '../../tests/api-test-utils';

describe('General Routes API Tests', () => {
    let app: any;
    let server: Server;

    beforeAll(async () => {
        const serverInfo = await createServer();
        app = serverInfo.app;
        server = serverInfo.server;
    });

    afterAll(async () => {
        await closeServer({ server });
    });

    afterEach(async () => {
        await cleanupTestData();
    });

    describe('GET /healthz', () => {
        it('should return 200 status with JSON response when Content-Type header is application/json', async () => {
            const response = await request(app)
                .get('/healthz')
                .set('Content-Type', 'application/json');

            expect(response.status).toBe(200);
            expect(response.type).toMatch(/json/);
            expect(response.body).toHaveProperty('status');
            expect(response.body.status).toBe('ok');
            expect(response.body).toHaveProperty('database');
            expect(response.body.database).toBe('connected');
        });

        it('should return 200 status with HTML response when Content-Type is not application/json', async () => {
            const response = await request(app).get('/healthz');

            expect(response.status).toBe(200);
            expect(response.type).toMatch(/html/);
            expect(response.text).toContain('<p>ok</p>');
        });
    });

    describe('GET /', () => {
        it('should return 200 status for home page', async () => {
            const response = await request(app).get('/');

            expect(response.status).toBe(200);
            expect(response.type).toMatch(/html/);
        });
    });

    describe('GET /about', () => {
        it('should return 200 status for about page', async () => {
            const response = await request(app).get('/about');

            expect(response.status).toBe(200);
            expect(response.type).toMatch(/html/);
        });
    });

    describe('GET /privacy-policy', () => {
        it('should return 200 status for privacy policy page', async () => {
            const response = await request(app).get('/privacy-policy');

            expect(response.status).toBe(200);
            expect(response.type).toMatch(/html/);
        });
    });

    describe('GET /terms-of-service', () => {
        it('should return 200 status for terms of service page', async () => {
            const response = await request(app).get('/terms-of-service');

            expect(response.status).toBe(200);
            expect(response.type).toMatch(/html/);
        });
    });

    describe('GET /api/collections', () => {
        it('should require authentication', async () => {
            const response = await request(app)
                .get('/api/collections')
                .set('Content-Type', 'application/json');

            expect(response.status).toBe(401);
            // The API response has a 'message' property, not 'error'
            expect(response.body).toHaveProperty('message');
            expect(response.body.message).toContain('Unauthorized');
        });

        it('should return collections for authenticated user', async () => {
            const { agent } = await createAuthenticatedAgent(app, 'test@example.com');

            const response = await agent
                .get('/api/collections')
                .set('Content-Type', 'application/json');

            expect(response.status).toBe(200);
            expect(response.type).toMatch(/json/);
            // The API returns collections directly without a 'data' wrapper
            expect(response.body).toHaveProperty('actions');
            expect(response.body).toHaveProperty('bookmarks');
            expect(response.body).toHaveProperty('notes');
            expect(response.body).toHaveProperty('tabs');
            expect(response.body).toHaveProperty('reminders');
        });
    });
});
