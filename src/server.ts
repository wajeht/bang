import { app } from './app';
import { logger } from './logger';
import { Request } from 'express';
import { Server } from 'node:http';
import { appConfig } from './config';
import { AddressInfo } from 'node:net';
import { db, runMigrations } from './db/db';
import { sendNotificationQueue } from './util';

const server: Server = app.listen(appConfig.port);

// Set server timeouts to avoid hanging connections
server.timeout = 120000; // 2 minutes
server.keepAliveTimeout = 65000; // 65 seconds (slightly higher than typical load balancer timeouts)

server.on('listening', async () => {
    const addr: string | AddressInfo | null = server.address();
    const bind: string = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + (addr as AddressInfo).port; // prettier-ignore

    logger.info(`Server is listening on ${bind}`);

    if (appConfig.env === 'production') {
        try {
            await db.raw('SELECT 1');
            logger.info('Database connection verified before migrations');
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

    const bind: string = typeof appConfig.port === 'string' ? 'Pipe ' + appConfig.port : 'Port ' + appConfig.port; // prettier-ignore

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

if (appConfig.env !== 'testing') {
    setInterval(
        () => {
            const memoryUsage = process.memoryUsage();
            logger.info(
                `Memory usage: RSS: ${Math.round(memoryUsage.rss / 1024 / 1024)}MB, Heap: ${Math.round(memoryUsage.heapUsed / 1024 / 1024)}/${Math.round(memoryUsage.heapTotal / 1024 / 1024)}MB`,
            );
        },
        5 * 60 * 1000,
    ); // Log every 5 minutes
}

function gracefulShutdown(signal: string): void {
    logger.info(`Received ${signal}, shutting down gracefully.`);

    // Track shutdown completion
    let shutdownComplete = false;

    server.close(async () => {
        logger.info('HTTP server closed.');

        try {
            // First try to drain any pending notification queue
            if (sendNotificationQueue) {
                logger.info('[gracefulShutdown]: Ensuring notification queue is processed...');
                // If your queue has a drain method, you would call it here
                await sendNotificationQueue.drain();
            }

            await db.destroy();
            logger.info('[gracefulShutdown]: Database connection closed.');

            shutdownComplete = true;
            logger.info('[gracefulShutdown]: All connections closed successfully.');
            process.exit(0);
        } catch (error) {
            logger.error(`[gracefulShutdown]: Error during shutdown: %o`, error);
            process.exit(1);
        }
    });

    setTimeout(() => {
        if (!shutdownComplete) {
            logger.error(
                '[gracefulShutdown]: Could not close connections in time, forcefully shutting down',
            );
            process.exit(1);
        }
    }, 10000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

process.on('warning', (warning: Error) => {
    logger.warn(`Process warning: %s - %s`, warning.name, warning.message);
});

process.on('uncaughtException', async (error: Error, origin: string) => {
    logger.error(`Uncaught Exception: %o, Origin: %s`, error, origin);

    if (appConfig.env === 'production') {
        try {
            void sendNotificationQueue.push({
                req: {} as Request,
                error,
            });
        } catch (error) {
            logger.error(`Failed to send uncaught exception notification: %o`, error);
        }
    }

    // Give a small delay to allow notification to be sent before exiting
    setTimeout(() => {
        gracefulShutdown('UNCAUGHT_EXCEPTION');
    }, 500);
});

process.on('unhandledRejection', async (reason: unknown, promise: Promise<unknown>) => {
    if (reason instanceof Error) {
        logger.error('Unhandled Rejection: %o, Promise: %o', reason, promise);

        if (appConfig.env === 'production') {
            try {
                void sendNotificationQueue.push({
                    req: {} as Request,
                    error: reason,
                });
            } catch (error) {
                logger.error(`Failed to send unhandled rejection notification: %o`, error);
            }
        }
    } else {
        logger.error(`Unhandled Rejection: %o, Reason: %o`, promise, reason);
    }

    // No need to exit for unhandled rejections - they are often recoverable
});
