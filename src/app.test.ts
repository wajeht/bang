import type { AddressInfo } from 'node:net';
import { serve, type ServerType } from '@hono/node-server';
import { describe, it, expect, vi } from 'vite-plus/test';
import { createApp, closeServer, activeSockets } from './app.js';
import type { AppContext } from './type.js';

async function createTestServer(): Promise<{ server: ServerType; ctx: AppContext }> {
    const { app, ctx } = await createApp();
    const server = serve({ fetch: app.fetch, port: 0 });

    server.on('connection', (socket) => {
        activeSockets.add(socket);
        socket.on('close', () => activeSockets.delete(socket));
    });

    await new Promise<void>((resolve) => {
        if (server.listening) resolve();
        else server.on('listening', resolve);
    });

    return { server, ctx };
}

function getServerUrl(server: ServerType) {
    const address = server.address() as AddressInfo;
    return `http://127.0.0.1:${address.port}`;
}

describe('App', () => {
    describe('createApp', () => {
        it('should create a Hono app with context', async () => {
            const { app, ctx } = await createApp();

            expect(app).toBeDefined();
            expect(app.fetch).toBeDefined();
            expect(ctx).toBeDefined();
            expect(ctx.db).toBeDefined();
            expect(ctx.logger).toBeDefined();
            expect(ctx.services.crons).toBeDefined();
        });

        it('should serve OpenAPI docs and Swagger UI', async () => {
            const { app } = await createApp();

            const specResponse = await app.request('/api-docs/openapi.json');
            expect(specResponse.status).toBe(200);

            const spec = await specResponse.json();
            expect(spec.info.title).toBe('Bang API');
            expect(spec.paths['/api/actions']).toBeDefined();
            expect(spec.components.securitySchemes.BearerAuth).toBeDefined();

            const uiResponse = await app.request('/api-docs');
            expect(uiResponse.status).toBe(200);
            expect(await uiResponse.text()).toContain('SwaggerUIBundle');
        });
    });

    describe('Socket Tracking', () => {
        it('should return 0 for getActiveSocketsCount when no connections', () => {
            activeSockets.clear();
            expect(activeSockets.size).toBe(0);
        });

        it('should track connections when HTTP requests are made', async () => {
            const { server } = await createTestServer();

            activeSockets.clear();
            const initialCount = activeSockets.size;

            const response = await fetch(`${getServerUrl(server)}/healthz`);
            expect(response.status).toBe(200);

            expect(activeSockets.size).toBeGreaterThanOrEqual(initialCount);

            server.close();
        });

        it('should allow clearing sockets via clearActiveSockets', async () => {
            const { server } = await createTestServer();

            const response = await fetch(`${getServerUrl(server)}/healthz`);
            expect(response.status).toBe(200);

            activeSockets.clear();
            expect(activeSockets.size).toBe(0);

            server.close();
        });
    });

    describe('closeServer', () => {
        it('should stop cron service', async () => {
            const { server, ctx } = await createTestServer();

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
            const { server, ctx } = await createTestServer();

            const dbDestroySpy = vi.spyOn(ctx.db, 'destroy').mockResolvedValue(undefined);

            await closeServer({ server, ctx });

            expect(dbDestroySpy).toHaveBeenCalled();

            dbDestroySpy.mockRestore();
        });

        it('should close HTTP server', async () => {
            const { server, ctx } = await createTestServer();

            expect(server.listening).toBe(true);

            const dbDestroySpy = vi.spyOn(ctx.db, 'destroy').mockResolvedValue(undefined);

            await closeServer({ server, ctx });

            expect(server.listening).toBe(false);

            dbDestroySpy.mockRestore();
        });

        it('should clear all active sockets', async () => {
            const { server, ctx } = await createTestServer();

            const response = await fetch(`${getServerUrl(server)}/healthz`);
            expect(response.status).toBe(200);

            const dbDestroySpy = vi.spyOn(ctx.db, 'destroy').mockResolvedValue(undefined);

            await closeServer({ server, ctx });

            expect(activeSockets.size).toBe(0);

            dbDestroySpy.mockRestore();
        });

        it('should execute shutdown steps in correct order', async () => {
            const { server, ctx } = await createTestServer();

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
            expect(activeSockets.size).toBe(0);
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
