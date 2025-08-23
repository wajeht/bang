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
import cron from 'node-cron';
import express from 'express';
import flash from 'connect-flash';
import { config } from './config';
import compression from 'compression';
import { logger } from './utils/logger';
import { router } from './routes/routes';
import { processReminderDigests } from './utils/mail';
import { expressJSDocSwaggerHandler } from './utils/swagger';
import { runProductionMigration, checkDatabaseHealth, optimizeDatabase } from './db/db';

async function inittializeDatabase() {
    try {
        await checkDatabaseHealth();
        await optimizeDatabase();
        await runProductionMigration();
        logger.info('Database migrations completed successfully');
    } catch (error: any) {
        logger.error('Error while initalizing databse: %o', { error });
    }
}

export function createCronJobs() {
    cron.schedule(
        '*/15 * * * *', // every 15 minutes
        async () => {
            logger.info('Checking for due reminders...');
            try {
                await processReminderDigests();
                logger.info('Reminder check completed');
            } catch (error: any) {
                logger.error('Reminder check failed: %o', { error });
            }
        },
        {
            timezone: 'UTC',
        },
    );

    logger.info('Reminder check scheduled every 15 minutes');
}

export async function createApp() {
    const app = express();

    if (config.app.env === 'production') {
        try {
            await inittializeDatabase();
        } catch (error) {
            logger.error('Database connection or migration error: %o', { error: error as any });
            throw error;
        }
    }

    if (config.app.env === 'development') {
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
            logger.warn('Express templates reload not available in production');
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
        .set('view cache', config.app.env === 'production')
        .set('views', './src/routes')
        .use(
            layoutMiddleware({
                defaultLayout: '_layouts/public.html',
                layoutsDir: '_layouts',
            }),
        )
        .use(...csrfMiddleware)
        .use(appLocalStateMiddleware)
        .use(router);

    expressJSDocSwaggerHandler(app);

    app.use(notFoundMiddleware());
    app.use(errorMiddleware());

    return app;
}
