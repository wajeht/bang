import { db } from './db/db';
import { config } from './config';
import { Server } from 'node:http';
import { notifyError } from './error';
import { AddressInfo } from 'node:net';
import { logger } from './utils/logger';
import { isMailpitRunning } from './utils/mail';
import { createApp, setupCronJobs } from './app';

export async function createServer() {
    const app = await createApp();

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

export async function main() {
    process.title = 'bang';

    const serverInfo = await createServer();

    const gracefulShutdown = async (signal: string) => {
        logger.info(`Received ${signal}, shutting down gracefully.`);

        setTimeout(() => {
            logger.error(
                '[gracefulShutdown]: Could not close connections in time, forcefully shutting down',
            );
            process.exit(1);
        }, 10000).unref();

        try {
            await closeServer(serverInfo);
            process.exit(0);
        } catch (error) {
            logger.error(`[gracefulShutdown]: Error during shutdown: %o`, {
                error: error as Error,
            });
            process.exit(1);
        }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

    process.on('warning', (warning) => {
        logger.warn(`Process warning: ${warning.name} - ${warning.message}`);
    });

    process.on('uncaughtException', async (error, origin) => {
        logger.error(`Uncaught Exception: ${error}, Origin: ${origin}`);

        if (config.app.env === 'production') {
            try {
                notifyError(error);
            } catch (notificationError) {
                logger.error(`Failed to send uncaught exception notification: %o`, {
                    error: notificationError as Error,
                });
            }
        }

        process.exit(1);
    });

    process.on('unhandledRejection', async (reason: unknown, promise: Promise<unknown>) => {
        if (reason instanceof Error) {
            logger.error('Unhandled Rejection: %o, Promise: %o', { reason, promise });

            if (config.app.env === 'production') {
                try {
                    notifyError(reason);
                } catch (notificationError) {
                    logger.error(`Failed to send unhandled rejection notification: %o`, {
                        error: notificationError as Error,
                    });
                }
            }
        } else {
            logger.error(`Unhandled Rejection: %o, Reason: %o`, { promise, reason });
        }
    });
}

main().catch((error: Error) => {
    logger.error('Failed to start server: %o', { error });
    process.exit(1);
});
