import { config } from './config';
import { logger } from './utils/logger';
import { notifyError } from './error';
import { createServer, closeServer } from './app';

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
