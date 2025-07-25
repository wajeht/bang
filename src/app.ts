import {
    csrfMiddleware,
    errorMiddleware,
    layoutMiddleware,
    helmetMiddleware,
    sessionMiddleware,
    notFoundMiddleware,
    rateLimitMiddleware,
    appLocalStateMiddleware,
} from './middleware';
import ejs from 'ejs';
import cors from 'cors';
import cron from 'node-cron';
import express from 'express';
import { router } from './router';
import flash from 'connect-flash';
import { config } from './config';
import { Server } from 'node:http';
import compression from 'compression';
import { AddressInfo } from 'node:net';
import { logger } from './utils/logger';
import { expressJSDocSwaggerHandler } from './utils/swagger';
import { isMailpitRunning, processReminderDigests } from './utils/util';
import { expressTemplatesReload } from '@wajeht/express-templates-reload';
import { db, runProdMigration, checkDatabaseHealth, optimizeDatabase } from './db/db';

async function initDatabase() {
    await checkDatabaseHealth();
    await optimizeDatabase();
    await runProdMigration();
    logger.info('Database migrations completed successfully');
}

function setupCronJobs() {
    // Check for due reminders every 15 minutes
    cron.schedule(
        '*/15 * * * *',
        async () => {
            logger.info('Checking for due reminders...');
            try {
                await processReminderDigests();
                logger.info('Reminder check completed');
            } catch (error) {
                logger.error('Reminder check failed: %o', { error });
            }
        },
        {
            timezone: 'UTC',
        },
    );

    logger.info('Reminder check scheduled every 15 minutes');
}

export async function createServer() {
    const app = express();

    if (config.app.env === 'production') {
        try {
            await initDatabase();
        } catch (error) {
            logger.error('Database connection or migration error: %o', { error: error as any });
            throw error;
        }
    }

    if (config.app.env === 'development') {
        expressTemplatesReload({
            app,
            watch: [
                { path: './public', extensions: ['.css', '.js'] },
                { path: './src/views', extensions: ['.html'] },
            ],
            options: { quiet: true },
        });
    }

    app.set('trust proxy', 1)
        .use(sessionMiddleware())
        .use(flash())
        .use(compression())
        .use(cors())
        .use(helmetMiddleware())
        .use(rateLimitMiddleware())
        .use(express.json({ limit: '10mb' }))
        .use(express.urlencoded({ extended: true, limit: '10mb' })) // to be able to handle export/import data
        .use(express.static('./public', { maxAge: '30d', etag: true, lastModified: true }))
        .engine('html', ejs.renderFile)
        .set('view engine', 'html')
        .set('view cache', config.app.env === 'production')
        .set('views', './src/views/pages')
        .use(
            layoutMiddleware({
                defaultLayout: '../layouts/public.html',
                layoutsDir: '../layouts',
            }),
        )
        .use(...csrfMiddleware)
        .use(appLocalStateMiddleware)
        .use(router);

    expressJSDocSwaggerHandler(app);

    app.use(notFoundMiddleware());
    app.use(errorMiddleware());

    const server: Server = app.listen(config.app.port);

    server.timeout = 120000; // 2 minutes
    server.keepAliveTimeout = 65000; // 65 seconds
    server.headersTimeout = 66000; // slightly higher than keepAliveTimeout
    server.requestTimeout = 120000; // same as timeout

    server.on('listening', async () => {
        const addr: string | AddressInfo | null = server.address();
        const bind: string = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + (addr as AddressInfo).port; // prettier-ignore

        logger.info(`Server is listening on ${bind}`);

        if (config.app.env === 'development' && (await isMailpitRunning())) {
            logger.info('Mailpit is running on http://localhost:8025');
        }

        setupCronJobs();
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
            logger.error(`[closeServer]: Error during shutdown: %o`, { error: error as any });
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
