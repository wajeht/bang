import { Hono } from 'hono';
import type { AppContext } from '../../type.js';

export function createGeneralHonoRouter(ctx: AppContext) {
    const app = new Hono();

    app.get('/healthz', async (c) => {
        await ctx.db.raw('SELECT 1');

        if (c.req.header('Content-Type')?.includes('application/json')) {
            return c.json({ status: 'ok', database: 'connected' });
        }

        return c.html('<p>ok</p>');
    });

    app.get('/metrics', (c) => {
        const mem = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        return c.json({
            memory: {
                rss: `${Math.round(mem.rss / 1024 / 1024)} MB`,
                heapTotal: `${Math.round(mem.heapTotal / 1024 / 1024)} MB`,
                heapUsed: `${Math.round(mem.heapUsed / 1024 / 1024)} MB`,
                external: `${Math.round(mem.external / 1024 / 1024)} MB`,
                arrayBuffers: `${Math.round((mem.arrayBuffers || 0) / 1024 / 1024)} MB`,
            },
            cpu: {
                user: `${Math.round(cpuUsage.user / 1000)} ms`,
                system: `${Math.round(cpuUsage.system / 1000)} ms`,
            },
            process: {
                uptime: `${Math.round(process.uptime())} seconds`,
                pid: process.pid,
                nodeVersion: process.version,
                platform: process.platform,
                arch: process.arch,
            },
            env: ctx.config.app.env,
        });
    });

    return app;
}
