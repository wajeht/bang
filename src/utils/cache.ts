import fs from 'node:fs/promises';
import { logger } from './logger';
import { isApiRequest } from './util';
import type { Request, Response, NextFunction } from 'express';

export const CACHE_DURATION = {
    second: 1,
    minute: 60,
    hour: 60 * 60,
    day: 24 * 60 * 60,
    week: 7 * 24 * 60 * 60,
    month: 30 * 24 * 60 * 60,
    year: 365 * 24 * 60 * 60,
} as const;

export function createCacheManager() {
    let userDataVersion = Date.now();

    return {
        invalidateUserData() {
            userDataVersion = Date.now();
            logger.info(
                `[invalidateUserData] User data cache manually invalidated. New version: ${userDataVersion}`,
            );
        },

        middleware(
            duration: number,
            unit: keyof typeof CACHE_DURATION = 'second',
            filePath?: string,
        ) {
            const seconds = duration * CACHE_DURATION[unit];

            return async (req: Request, res: Response, next: NextFunction) => {
                if (req.method !== 'GET') {
                    return next();
                }

                let etag: string;

                if (filePath) {
                    // File-based ETag (for static pages)
                    try {
                        const stats = await fs.stat(filePath);
                        etag = `${stats.mtime.getTime()}`;
                    } catch {
                        etag = userDataVersion.toString();
                    }
                } else {
                    // User data ETag (for APIs)
                    etag = userDataVersion.toString();
                }

                res.set('ETag', `"${etag}"`);

                // 304 if same ETag
                if (req.headers['if-none-match'] === `"${etag}"`) {
                    logger.info(
                        `[middleware] CACHE HIT for ${req.method} ${req.originalUrl}. Sending 304.`,
                    );
                    res.status(304).end();
                    return;
                }

                logger.info(`[middleware] CACHE MISS for ${req.method} ${req.originalUrl}.`);

                // Cache headers
                const cacheControl = isApiRequest(req)
                    ? `private, max-age=${seconds}, must-revalidate`
                    : `public, max-age=${seconds}, must-revalidate`;

                res.set('Cache-Control', cacheControl);
                if (isApiRequest(req)) {
                    res.set('Vary', 'Authorization, Accept-Encoding');
                }

                next();
            };
        },

        autoInvalidate() {
            return (req: Request, res: Response, next: NextFunction) => {
                const originalSend = res.send.bind(res);
                const originalJson = res.json.bind(res);
                const originalRedirect = res.redirect.bind(res);

                res.send = function (body: any) {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        userDataVersion = Date.now();
                        logger.info(
                            `[autoInvalidate] Auto-invalidated by res.send() for ${req.method} ${req.originalUrl}. New version: ${userDataVersion}`,
                        );
                    }
                    return originalSend(body);
                };

                res.json = function (body: any) {
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        userDataVersion = Date.now();
                        logger.info(
                            `[autoInvalidate] Auto-invalidated by res.json() for ${req.method} ${req.originalUrl}. New version: ${userDataVersion}`,
                        );
                    }
                    return originalJson(body);
                };

                res.redirect = function (...args: any[]) {
                    userDataVersion = Date.now();
                    logger.info(
                        `[autoInvalidate] Auto-invalidated by res.redirect() for ${req.method} ${req.originalUrl}. New version: ${userDataVersion}`,
                    );
                    return originalRedirect.apply(this, args as any);
                };

                next();
            };
        },
    };
}

export const {
    middleware: cacheMiddleware,
    autoInvalidate: autoInvalidateMiddleware,
    invalidateUserData,
} = createCacheManager();
