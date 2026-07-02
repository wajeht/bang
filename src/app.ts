import { config } from './config.js';
import { Socket } from 'node:net';
import { serve, type ServerType } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { bodyLimit } from 'hono/body-limit';
import { compress } from 'hono/compress';
import { cors } from 'hono/cors';
import { etag } from 'hono/etag';
import { requestId } from 'hono/request-id';
import { secureHeaders } from 'hono/secure-headers';
import { trimTrailingSlash } from 'hono/trailing-slash';
import { createContext } from './context.js';
import type { AppContext } from './type.js';
import { createRouter } from './routes/routes.js';
import { createBodyParserMiddleware, createHonoApp } from './http.js';

export const activeSockets = new Set<Socket>();

const STATIC_CACHE_CONTROL = 'public, max-age=31536000, immutable';

export async function createApp() {
    const ctx = await createContext();
    const app = createHonoApp();

    if (ctx.config.app.env === 'production') {
        try {
            await ctx.database.inittializeDatabase();
        } catch (error) {
            ctx.logger.error('Database connection or migration error', { error });
            throw error;
        }
    }

    const onStaticFound = (_path: string, c: import('hono').Context) => {
        c.header('Cache-Control', STATIC_CACHE_CONTROL);
        c.header('Vary', 'Accept-Encoding');
    };

    app.use(trimTrailingSlash());
    app.use(
        '/*',
        serveStatic({
            root: './public',
            onFound: onStaticFound,
        }),
    );
    app.use(
        '*',
        requestId({
            generator: () => ctx.libs.crypto.randomUUID().slice(0, 8),
        }),
    );
    app.use('*', ctx.middleware.session);
    app.use('*', ctx.middleware.requestLogger);
    app.use(
        '*',
        bodyLimit({
            maxSize: 5 * 1024 * 1024,
            onError: (c) => c.json({ message: 'Payload too large' }, 413),
        }),
    );
    app.use('*', createBodyParserMiddleware());
    app.use('*', compress());
    app.use('*', etag());
    app.use(
        '*',
        cors({
            credentials: true,
            origin: (origin) => {
                if (ctx.config.app.env !== 'production') return origin ?? '*';
                return origin === ctx.config.app.appUrl ? origin : ctx.config.app.appUrl;
            },
        }),
    );
    app.use(
        '*',
        secureHeaders({
            contentSecurityPolicy: {
                defaultSrc: ["'self'", ctx.config.app.appUrl, '*.cloudflare.com'],
                imgSrc: ["'self'", '*'],
                scriptSrc: [
                    "'self'",
                    "'unsafe-inline'",
                    'blob:',
                    ctx.config.app.appUrl,
                    '*.cloudflare.com',
                    'https://cdn.jsdelivr.net',
                    'https://umami.jaw.dev',
                ],
                scriptSrcElem: [
                    "'self'",
                    "'unsafe-inline'",
                    '*.cloudflare.com',
                    '*.cloudflareinsights.com',
                    'https://cdn.jsdelivr.net',
                    'https://umami.jaw.dev',
                ],
                frameSrc: ["'self'", '*.cloudflare.com'],
                styleSrc: ["'self'", "'unsafe-inline'", '*.cloudflare.com'],
                styleSrcElem: [
                    "'self'",
                    "'unsafe-inline'",
                    '*.cloudflare.com',
                    'https://cdn.jsdelivr.net',
                ],
                connectSrc: [
                    "'self'",
                    '*.cloudflare.com',
                    '*.cloudflareinsights.com',
                    'https://umami.jaw.dev',
                ],
                scriptSrcAttr: ["'self'", "'unsafe-inline'"],
                formAction: ["'self'", 'https:'],
                workerSrc: ["'self'", 'blob:'],
            },
            referrerPolicy: 'strict-origin-when-cross-origin',
        }),
    );
    app.use('*', ctx.middleware.speculationRules);
    app.use('*', ctx.middleware.rateLimit);
    app.use('*', ctx.middleware.csrf);
    app.use('*', ctx.middleware.appLocalState);

    app.route('/', createRouter(ctx));
    app.notFound(ctx.middleware.notFound);
    app.onError(ctx.middleware.errorHandler);

    return { app, ctx };
}

export async function createServer() {
    const { app, ctx } = await createApp();

    const server = serve({ fetch: app.fetch, port: config.app.port });
    const nodeServer = server as any;

    nodeServer.timeout = 120000;
    nodeServer.keepAliveTimeout = 65000;
    nodeServer.headersTimeout = 66000;
    nodeServer.requestTimeout = 120000;

    server.on('connection', (socket: Socket) => {
        activeSockets.add(socket);
        socket.on('close', () => activeSockets.delete(socket));
    });

    server.on('listening', async () => {
        ctx.logger.info('Server is listening', { bind: `port ${config.app.port}` });
        await ctx.services.crons.start();
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.syscall !== 'listen') {
            throw error;
        }

        const bind =
            typeof config.app.port === 'string'
                ? 'Pipe ' + config.app.port
                : 'Port ' + config.app.port;

        switch (error.code) {
            case 'EACCES':
                ctx.logger.error('Port requires elevated privileges', { bind });
                process.exit(1);
            case 'EADDRINUSE':
                ctx.logger.error('Port is already in use', { bind });
                process.exit(1);
            default:
                throw error;
        }
    });

    return { app, server, ctx };
}

export async function closeServer({ server, ctx }: { server: ServerType; ctx: AppContext }) {
    ctx.logger.info('Shutting down server gracefully');

    try {
        ctx.services.crons.stop();
        ctx.logger.info('Cron service stopped');

        await ctx.db.destroy();
        ctx.logger.info('Database connection closed');

        ctx.logger.info('Closing active connections', { count: activeSockets.size });
        for (const socket of activeSockets) {
            socket.destroy();
        }
        activeSockets.clear();

        await new Promise<void>((resolve, reject) => {
            const shutdownTimeout = setTimeout(() => {
                ctx.logger.error('Could not close connections in time, forcefully shutting down');
                reject(new Error('Server close timeout'));
            }, 5000);

            server.close((error) => {
                clearTimeout(shutdownTimeout);
                if (error) {
                    ctx.logger.error('Error closing HTTP server', { error });
                    reject(error);
                } else {
                    ctx.logger.info('HTTP server closed');
                    resolve();
                }
            });
        });

        ctx.logger.info('Server shutdown complete');
    } catch (error) {
        ctx.logger.error('Error during graceful shutdown', { error });
        throw error;
    }
}
