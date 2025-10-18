import { logger } from './utils/logger';
import { createServer, closeServer } from './app';

async function gracefulShutdown(
    signal: string,
    serverInfo: Awaited<ReturnType<typeof createServer>>,
) {
    logger.info(`Received ${signal}, shutting down gracefully.`);

    setTimeout(() => {
        logger.error('Could not close connections in time, forcefully shutting down');
        process.exit(1);
    }, 10000).unref();

    try {
        await closeServer(serverInfo);
        process.exit(0);
    } catch (error) {
        logger.error(`Error during shutdown: %o`, { error: error as Error });
        process.exit(1);
    }
}

function handleWarning(warning: any) {
    logger.warn(`Process warning: ${warning.name} - ${warning.message}`);
}

function handleUncaughtException(error: Error, origin: string) {
    logger.error(`Uncaught Exception: ${error.message}, Origin: ${origin}`);
    process.exit(1);
}

function handleUnhandledRejection(reason: unknown, _promise: Promise<unknown>) {
    if (reason instanceof Error) {
        logger.error(`Unhandled Rejection: ${reason.message}`);
    } else {
        logger.error(`Unhandled Rejection: %o`, reason);
    }

    process.exit(1);
}

async function main() {
    const serverInfo = await createServer();
    process.title = 'bang';

    process.on('SIGINT', () => gracefulShutdown('SIGINT', serverInfo));
    process.on('SIGTERM', () => gracefulShutdown('SIGTERM', serverInfo));
    process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT', serverInfo));

    process.on('warning', handleWarning);
    process.on('uncaughtException', handleUncaughtException);
    process.on('unhandledRejection', handleUnhandledRejection);
}

main().catch((error: Error) => {
    logger.error('Failed to start server: %o', { error });
    process.exit(1);
});
