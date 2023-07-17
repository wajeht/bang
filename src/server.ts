import app from './app';

import ENV from './configs/env';

const server = app.listen(ENV.SERVER_PORT, async () => {
	try {
		// await db.init();
		// await crons.init();
		// await admin.init();

		console.log(`**** app was started on http://localhost:${ENV.SERVER_PORT} ****`);
	} catch (error) {
		console.log('**** An error occurred during server start ', error, ' ****');
		process.exit(1);
	}
});

export async function gracefulShutdown() {
	console.log('**** Received kill signal, shutting down gracefully. ****');
	server.close(async () => {
		try {
			// redis.disconnect();
			// await db.stop();
			console.log('**** Closed out remaining connections. ****');
			process.exit();
		} catch (err) {
			console.log('**** Error during shutdown ', err, ' ****');
			process.exit(1);
		}
	});

	setTimeout(() => {
		console.log('**** Could not close connections in time, forcefully shutting down ****');
		process.exit(1);
	}, 30 * 1000); // force shutdown after 30s
}

process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
process.on('unhandledRejection', (reason, promise) => {
	console.log('**** Unhandled Rejection at: ', promise, ' reason: ', reason, ' ****');
});
