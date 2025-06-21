import {
    csrfMiddleware,
    errorMiddleware,
    helmetMiddleware,
    sessionMiddleware,
    notFoundMiddleware,
    rateLimitMiddleware,
    appLocalStateMiddleware,
} from './middleware';
import ejs from 'ejs';
import cors from 'cors';
import express from 'express';
import { router } from './router';
import flash from 'connect-flash';
import { config } from './config';
import { logger } from './logger';
import { Server } from 'node:http';
import compression from 'compression';
import { AddressInfo } from 'node:net';
import { isMailpitRunning } from './util';
import expressLayouts from 'express-ejs-layouts';
import { expressJSDocSwaggerHandler, swagger } from './util';
import { db, runMigrations, checkDatabaseHealth, optimizeDatabase } from './db/db';
import { expressTemplatesReload as reload } from '@wajeht/express-templates-reload';

export async function createServer() {
    const app = express()
        .set('trust proxy', 1)
        .use(sessionMiddleware())
        .use(flash())
        .use(compression())
        .use(cors())
        .use(helmetMiddleware())
        .use(rateLimitMiddleware())
        .use(express.json({ limit: '10mb' }))
        .use(express.urlencoded({ extended: true, limit: '10mb' }))
        .use(express.static('./public', { maxAge: '30d', etag: true, lastModified: true }))
        .engine('html', ejs.renderFile)
        .set('view engine', 'html')
        .set('view cache', config.app.env === 'production')
        .set('views', './src/views/pages')
        .set('layout', '../layouts/public.html')
        .use(expressLayouts)
        .use(...csrfMiddleware)
        .use(appLocalStateMiddleware);

    if (config.app.env === 'development') {
        reload({
            app,
            options: { quiet: false },
            watch: [
                { path: './public/style.css' },
                { path: './public/script.js' },
                { path: './src/views', extensions: ['.html'] },
            ],
        });
    }

    app.use(router);

    expressJSDocSwaggerHandler(app, swagger);

    app.use(notFoundMiddleware());
    app.use(errorMiddleware());

    const server: Server = app.listen(config.app.port);

    server.timeout = 120000; // 2 minutes
    server.keepAliveTimeout = 65000; // 65 seconds
    server.headersTimeout = 66000; // slightly higher than keepAliveTimeout
    server.requestTimeout = 120000; // same as timeout

    server.on('listening', async () => {
        const addr: string | AddressInfo | null = server.address();
        const bind: string =
            typeof addr === 'string' ? 'pipe ' + addr : 'port ' + (addr as AddressInfo).port;

        logger.info(`Server is listening on ${bind}`);
        if (config.app.env === 'development') {
            const isRunning = await isMailpitRunning();
            if (isRunning) {
                logger.info('mailpit is running on http://localhost:8025');
            }
        }

        if (config.app.env === 'production') {
            try {
                await checkDatabaseHealth();
                await optimizeDatabase();
                await runMigrations();
                logger.info('Database migrations completed successfully');
            } catch (error) {
                logger.error('Database connection or migration error: %o', error);
            }
        }
    });

    server.on('error', (error: NodeJS.ErrnoException) => {
        if (error.syscall !== 'listen') {
            throw error;
        }

        const bind: string =
            typeof config.app.port === 'string'
                ? 'Pipe ' + config.app.port
                : 'Port ' + config.app.port;

        switch (error.code) {
            case 'EACCES':
                logger.error(`${bind} requires elevated privileges`);
                process.exit(1);
                break;
            case 'EADDRINUSE':
                logger.error(`${bind} is already in use`);
                process.exit(1);
                break;
            default:
                throw error;
        }
    });

    return { app, server };
}

export async function closeServer({ server }: { server: Server }) {
    logger.info('Shutting down server gracefully...');

    let shutdownComplete = false;

    server.keepAliveTimeout = 0;
    server.headersTimeout = 0;
    server.timeout = 1;

    server.close(async () => {
        logger.info('HTTP server closed.');

        try {
            await db.destroy();
            logger.info('[closeServer]: Database connection closed.');

            shutdownComplete = true;
            logger.info('[closeServer]: All connections closed successfully.');
        } catch (error) {
            logger.error(`[closeServer]: Error during shutdown: %o`, error);
            throw error;
        }
    });

    setTimeout(() => {
        if (!shutdownComplete) {
            logger.error(
                '[closeServer]: Could not close connections in time, forcefully shutting down',
            );
            process.exit(1);
        }
    }, 10000);
}
