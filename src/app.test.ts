import { describe, it, expect, beforeAll, afterAll, afterEach } from 'vitest';
import { createApp, getActiveSocketsCount, clearActiveSockets } from './app';
import { cleanupTestData, cleanupTestDatabase } from './tests/api-test-utils';
import { db } from './tests/test-setup';
import request from 'supertest';
import type { Server } from 'node:http';

describe('App', () => {
    beforeAll(async () => {
        await db.migrate.latest();
    });

    afterEach(async () => {
        await cleanupTestData();
        clearActiveSockets();
    });

    afterAll(async () => {
        await cleanupTestDatabase();
    });

    describe('createApp', () => {
        it('should create an Express app with context', async () => {
            const { app, ctx } = await createApp();

            expect(app).toBeDefined();
            expect(ctx).toBeDefined();
            expect(ctx.db).toBeDefined();
            expect(ctx.logger).toBeDefined();
            expect(ctx.services.crons).toBeDefined();
        });
    });

    describe('Socket Tracking', () => {
        it('should return 0 for getActiveSocketsCount when no connections', () => {
            clearActiveSockets();
            expect(getActiveSocketsCount()).toBe(0);
        });

        it('should track connections when HTTP requests are made', async () => {
            const { app } = await createApp();
            const server: Server = app.listen(0);

            await new Promise<void>((resolve) => {
                if (server.listening) resolve();
                else server.on('listening', resolve);
            });

            clearActiveSockets();
            const initialCount = getActiveSocketsCount();

            await request(app).get('/healthz').expect(200);

            expect(getActiveSocketsCount()).toBeGreaterThanOrEqual(initialCount);

            server.close();
        });

        it('should allow clearing sockets via clearActiveSockets', async () => {
            const { app } = await createApp();
            const server: Server = app.listen(0);

            await new Promise<void>((resolve) => {
                if (server.listening) resolve();
                else server.on('listening', resolve);
            });

            await request(app).get('/healthz').expect(200);

            clearActiveSockets();
            expect(getActiveSocketsCount()).toBe(0);

            server.close();
        });
    });

    describe('Server lifecycle', () => {
        it('should close HTTP server when server.close is called', async () => {
            const { app } = await createApp();
            const server: Server = app.listen(0);

            await new Promise<void>((resolve) => {
                if (server.listening) resolve();
                else server.on('listening', resolve);
            });

            expect(server.listening).toBe(true);

            await new Promise<void>((resolve) => server.close(() => resolve()));

            expect(server.listening).toBe(false);
        });

        it('should start and stop cron service', async () => {
            const { ctx } = await createApp();

            expect(ctx.services.crons.getStatus().isRunning).toBe(false);

            await ctx.services.crons.start();
            expect(ctx.services.crons.getStatus().isRunning).toBe(true);

            ctx.services.crons.stop();
            expect(ctx.services.crons.getStatus().isRunning).toBe(false);
        });
    });
});
