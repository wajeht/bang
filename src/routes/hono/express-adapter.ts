import { getRequestListener } from '@hono/node-server';
import type { RequestHandler } from 'express';

type HonoFetch = Parameters<typeof getRequestListener>[0];

export function createHonoRequestHandler(fetch: HonoFetch): RequestHandler {
    const requestListener = getRequestListener(fetch, { overrideGlobalObjects: false });

    return async (req, res, next) => {
        const originalUrl = req.url;
        req.url = req.originalUrl;

        try {
            await requestListener(req, res);
        } catch (error) {
            next(error);
        } finally {
            req.url = originalUrl;
        }
    };
}
