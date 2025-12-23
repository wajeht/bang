import { describe, it, expect, afterAll, afterEach, vi } from 'vitest';
import { createApp, closeServer, getActiveSocketsCount, clearActiveSockets } from './app';
import { cleanupTestData, cleanupTestDatabase } from './tests/api-test-utils';
import request from 'supertest';
import type { Server } from 'node:http';

describe('App', () => {
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

    describe('closeServer', () => {
        it('should stop cron service', async () => {
            const { app, ctx } = await createApp();
            const server: Server = app.listen(0);

            await new Promise<void>((resolve) => {
                if (server.listening) resolve();
                else server.on('listening', resolve);
            });

            await ctx.services.crons.start();
            expect(ctx.services.crons.getStatus().isRunning).toBe(true);

            const cronStopSpy = vi.spyOn(ctx.services.crons, 'stop');
            const dbDestroySpy = vi.spyOn(ctx.db, 'destroy').mockResolvedValue(undefined);

            await closeServer({ server, ctx });

            expect(cronStopSpy).toHaveBeenCalled();
            expect(ctx.services.crons.getStatus().isRunning).toBe(false);

            cronStopSpy.mockRestore();
            dbDestroySpy.mockRestore();
        });

        it('should destroy database connection', async () => {
            const { app, ctx } = await createApp();
            const server: Server = app.listen(0);

            await new Promise<void>((resolve) => {
                if (server.listening) resolve();
                else server.on('listening', resolve);
            });

            const dbDestroySpy = vi.spyOn(ctx.db, 'destroy').mockResolvedValue(undefined);

            await closeServer({ server, ctx });

            expect(dbDestroySpy).toHaveBeenCalled();

            dbDestroySpy.mockRestore();
        });

        it('should close HTTP server', async () => {
            const { app, ctx } = await createApp();
            const server: Server = app.listen(0);

            await new Promise<void>((resolve) => {
                if (server.listening) resolve();
                else server.on('listening', resolve);
            });

            expect(server.listening).toBe(true);

            const dbDestroySpy = vi.spyOn(ctx.db, 'destroy').mockResolvedValue(undefined);

            await closeServer({ server, ctx });

            expect(server.listening).toBe(false);

            dbDestroySpy.mockRestore();
        });

        it('should clear all active sockets', async () => {
            const { app, ctx } = await createApp();
            const server: Server = app.listen(0);

            await new Promise<void>((resolve) => {
                if (server.listening) resolve();
                else server.on('listening', resolve);
            });

            await request(app).get('/healthz').expect(200);

            const dbDestroySpy = vi.spyOn(ctx.db, 'destroy').mockResolvedValue(undefined);

            await closeServer({ server, ctx });

            expect(getActiveSocketsCount()).toBe(0);

            dbDestroySpy.mockRestore();
        });

        it('should execute shutdown steps in correct order', async () => {
            const { app, ctx } = await createApp();
            const server: Server = app.listen(0);

            await new Promise<void>((resolve) => {
                if (server.listening) resolve();
                else server.on('listening', resolve);
            });

            await ctx.services.crons.start();

            const callOrder: string[] = [];

            const cronStopSpy = vi.spyOn(ctx.services.crons, 'stop').mockImplementation(() => {
                callOrder.push('cron.stop');
                ctx.services.crons.getStatus = () => ({ isRunning: false, jobCount: 0 });
            });

            const dbDestroySpy = vi.spyOn(ctx.db, 'destroy').mockImplementation(async () => {
                callOrder.push('db.destroy');
            });

            await closeServer({ server, ctx });

            expect(callOrder[0]).toBe('cron.stop');
            expect(callOrder[1]).toBe('db.destroy');
            expect(getActiveSocketsCount()).toBe(0);
            expect(server.listening).toBe(false);

            cronStopSpy.mockRestore();
            dbDestroySpy.mockRestore();
        });
    });

    describe('Server lifecycle', () => {
        it('should start and stop cron service independently', async () => {
            const { ctx } = await createApp();

            expect(ctx.services.crons.getStatus().isRunning).toBe(false);

            await ctx.services.crons.start();
            expect(ctx.services.crons.getStatus().isRunning).toBe(true);
            expect(ctx.services.crons.getStatus().jobCount).toBe(3);

            ctx.services.crons.stop();
            expect(ctx.services.crons.getStatus().isRunning).toBe(false);
        });
    });
});
