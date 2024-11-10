import { app } from './app';
import { Server } from 'http';
import { AddressInfo } from 'net';
import { appConfig } from './config';

const server: Server = app.listen(appConfig.port);

server.on('listening', async () => {
	const addr: string | AddressInfo | null = server.address();
	const bind: string =
		typeof addr === 'string' ? 'pipe ' + addr : 'port ' + (addr as AddressInfo).port;

	console.log(`Server is listening on ${bind}`);
});

server.on('error', (error: NodeJS.ErrnoException) => {
	if (error.syscall !== 'listen') {
		throw error;
	}

	const bind: string =
		typeof appConfig.port === 'string' ? 'Pipe ' + appConfig.port : 'Port ' + appConfig.port;

	switch (error.code) {
		case 'EACCES':
			console.log(`${bind} requires elevated privileges`);
			process.exit(1);
		case 'EADDRINUSE':
			console.log(`${bind} is already in use`);
			process.exit(1);
		default:
			throw error;
	}
});

function gracefulShutdown(signal: string): void {
	console.log(`Received ${signal}, shutting down gracefully.`);

	server.close(async () => {
		console.log('HTTP server closed.');

		// try {
		// 	redis.quit();
		// 	console.log('Redis connection closed.');
		// } catch (error) {
		// 	console.log('Error closing Redis connection:', error);
		// }

		// try {
		// 	await db.destroy();
		// 	console.log('Database connection closed.');
		// } catch (error) {
		// 	console.log('Error closing database connection:', error);
		// }

		console.log('All connections closed successfully.');
		process.exit(0);
	});

	setTimeout(() => {
		console.log('Could not close connections in time, forcefully shutting down');
		process.exit(1);
	}, 10000);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGQUIT', () => gracefulShutdown('SIGQUIT'));

process.on('uncaughtException', async (error: Error, origin: string) => {
	console.log('Uncaught Exception:', error, 'Origin:', origin);
});

process.on('warning', (warning: Error) => {
	console.log('Process warning:', warning.name, warning.message);
});

process.on('unhandledRejection', async (reason: unknown, promise: Promise<unknown>) => {
	console.log('Unhandled Rejection:', promise, 'reason:', reason);
});
