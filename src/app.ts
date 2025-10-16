import {
    csrfMiddleware,
    errorMiddleware,
    layoutMiddleware,
    helmetMiddleware,
    sessionMiddleware,
    notFoundMiddleware,
    rateLimitMiddleware,
    staticAssetsMiddleware,
    appLocalStateMiddleware,
} from './routes/middleware';
import ejs from 'ejs';
import cors from 'cors';
import express from 'express';
import flash from 'connect-flash';
import { Server } from 'node:http';
import { config } from './config';
import compression from 'compression';
import { AddressInfo } from 'node:net';
import { logger } from './utils/logger';
import { router } from './routes/routes';
import { inittializeDatabase } from './db/db';
import { createContext, type AppContext } from './context';
import { expressJSDocSwaggerHandler } from './utils/swagger';

export async function createApp() {
    const ctx = await createContext();

    const app = express();

    if (ctx.config.app.env === 'production') {
        try {
            await inittializeDatabase();
        } catch (error) {
            ctx.logger.error('Database connection or migration error: %o', { error: error as any });
            throw error;
        }
    }

    if (ctx.config.app.env === 'development') {
        try {
            const { expressTemplatesReload } = await import('@wajeht/express-templates-reload');
            expressTemplatesReload({
                app,
                watch: [
                    { path: './src/public', extensions: ['.css', '.js'] },
                    { path: './src/routes', extensions: ['.html'] },
                ],
                options: { quiet: true },
            });
        } catch (error) {
            ctx.logger.warn('Express templates reload not available in production');
        }
    }

    app.set('trust proxy', 1)
        .use(sessionMiddleware())
        .use(flash())
        .use(compression())
        .use(cors())
        .use(helmetMiddleware())
        .use(rateLimitMiddleware())
        .use(express.json({ limit: '10mb' }))
        .use(express.urlencoded({ extended: true, limit: '10mb' }))
        .use(staticAssetsMiddleware())
        .engine('html', ejs.renderFile)
        .set('view engine', 'html')
        .set('view cache', ctx.config.app.env === 'production')
        .set('views', './src/routes')
        .use(
            layoutMiddleware({
                defaultLayout: '_layouts/public.html',
                layoutsDir: '_layouts',
            }),
        )
        .use(...csrfMiddleware)
        .use(appLocalStateMiddleware)
        .use(router(ctx));

    expressJSDocSwaggerHandler(app);

    app.use(notFoundMiddleware());
    app.use(errorMiddleware());

    return { app, ctx };
}

export async function createServer() {
    const { app, ctx } = await createApp();

    const server: Server = app.listen(config.app.port);

    server.timeout = 120000; // 2 minutes
    server.keepAliveTimeout = 65000; // 65 seconds
    server.headersTimeout = 66000; // slightly higher than keepAliveTimeout
    server.requestTimeout = 120000; // same as timeout

    server.on('listening', async () => {
        const addr: string | AddressInfo | null = server.address();
        const bind: string = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + (addr as AddressInfo).port; // prettier-ignore

        logger.info(`Server is listening on ${bind}`);

        await ctx.services.crons.start();
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.syscall !== 'listen') {
            throw error;
        }

        const bind: string = typeof config.app.port === 'string' ? 'Pipe ' + config.app.port : 'Port ' + config.app.port; // prettier-ignore

        switch (error.code) {
            case 'EACCES':
                logger.error(`${bind} requires elevated privileges`);
                process.exit(1);
                // eslint-disable-next-line no-fallthrough
            case 'EADDRINUSE':
                logger.error(`${bind} is already in use`);
                process.exit(1);
                // eslint-disable-next-line no-fallthrough
            default:
                throw error;
        }
    });

    return { app, server, ctx };
}

export async function closeServer({ server, ctx }: { server: Server; ctx: AppContext }) {
    logger.info('Shutting down server gracefully...');

    try {
        ctx.services.crons.stop();
        logger.info('Cron service stopped');

        await ctx.db.destroy();
        logger.info('Database connection closed');

        await new Promise<void>((resolve, reject) => {
            server.keepAliveTimeout = 0;
            server.headersTimeout = 0;
            server.timeout = 1;

            const shutdownTimeout = setTimeout(() => {
                logger.error('Could not close connections in time, forcefully shutting down');
                reject(new Error('Server close timeout'));
            }, 10000);

            server.close((error) => {
                clearTimeout(shutdownTimeout);
                if (error) {
                    logger.error('Error closing HTTP server: %o', error);
                    reject(error);
                } else {
                    logger.info('HTTP server closed');
                    resolve();
                }
            });
        });

        logger.info('Server shutdown complete');
    } catch (error) {
        logger.error('Error during graceful shutdown: %o', error);
        throw error;
    }
}
