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

    return app;
}
