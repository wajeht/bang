import { app } from './app';
import { logger } from './logger';
import { Request } from 'express';
import { Server } from 'node:http';
import { appConfig } from './configs';
import { AddressInfo } from 'node:net';
import { db, runMigrations } from './db/db';
import { sendNotificationQueue } from './utils';

const server: Server = app.listen(appConfig.port);

server.on('listening', async () => {
	const addr: string | AddressInfo | null = server.address();
	const bind: string = typeof addr === 'string' ? 'pipe ' + addr : 'port ' + (addr as AddressInfo).port; // prettier-ignore

	logger.info(`Server is listening on ${bind}`);

	if (appConfig.env === 'production') {
		await runMigrations();
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

function gracefulShutdown(signal: string): void {
	logger.info(`Received ${signal}, shutting down gracefully.`);

	server.close(async () => {
		logger.info('HTTP server closed.');

		try {
			await db.destroy();
			logger.info('Database connection closed.');
		} catch (error) {
			logger.error(`Error closing database connection: %o`, error);
		}

		logger.info('All connections closed successfully.');
		process.exit(0);
	});

	setTimeout(() => {
		logger.error('Could not close connections in time, forcefully shutting down');
		process.exit(1);
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
			await sendNotificationQueue.push({
				req: {} as Request,
				error,
			});
		} catch (error) {
			logger.error(`Failed to send uncaught exception notification: %o`, error);
		}
	}

	process.exit(1);
});

process.on('unhandledRejection', async (reason: unknown, promise: Promise<unknown>) => {
	if (reason instanceof Error) {
		logger.error('Unhandled Rejection: %o, Promise: %o', reason, promise);

		if (appConfig.env === 'production') {
			try {
				await sendNotificationQueue.push({
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
});
