import { createServer, closeServer } from './app';
import { logger } from './logger';
import { Request } from 'express';
import { config } from './config';
import { sendNotification } from './util';

export async function run() {
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
            logger.error(`[gracefulShutdown]: Error during shutdown: %o`, error);
            process.exit(1);
        }
    };

    process.on('SIGINT', () => gracefulShutdown('SIGINT'));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

    process.on('warning', (warning: Error) => {
        logger.warn(`Process warning: %s - %s`, warning.name, warning.message);
    });

    process.on('uncaughtException', async (error: Error, origin: string) => {
        logger.error(`Uncaught Exception: %o, Origin: %s`, error, origin);

        if (config.app.env === 'production') {
            try {
                setTimeout(
                    () =>
                        sendNotification({
                            req: {} as Request,
                            error,
                        }),
                    0,
                );
            } catch (error) {
                logger.error(`Failed to send uncaught exception notification: %o`, error);
            }
        }

        setTimeout(() => gracefulShutdown('UNCAUGHT_EXCEPTION'), 500);
    });

    process.on('unhandledRejection', async (reason: unknown, promise: Promise<unknown>) => {
        if (reason instanceof Error) {
            logger.error('Unhandled Rejection: %o, Promise: %o', reason, promise);

            if (config.app.env === 'production') {
                try {
                    setTimeout(
                        () =>
                            sendNotification({
                                req: {} as Request,
                                error: reason,
                            }),
                        0,
                    );
                } catch (error) {
                    logger.error(`Failed to send unhandled rejection notification: %o`, error);
                }
            }
        } else {
            logger.error(`Unhandled Rejection: %o, Reason: %o`, promise, reason);
        }
    });
}

run().catch((error: Error) => {
    logger.error('Failed to start server: %o', error);
    process.exit(1);
});
