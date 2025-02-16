import path from 'node:path';
import type { Knex } from 'knex';
import { appConfig } from '../configs';

function _getFormattedTimestamp() {
	const now = new Date();
	const hours = now.getHours();
	const minutes = now.getMinutes();
	const seconds = now.getSeconds();
	const ampm = hours >= 12 ? 'PM' : 'AM';
	const formattedHours = hours % 12 || 12;
	const formattedTime = `${formattedHours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} ${ampm}`;
	const formattedDate = now.toISOString().split('T')[0];
	return `[${formattedDate} ${formattedTime}]`;
}

const _developmentEnvironmentOnly = appConfig.env === 'development';

const knexConfig: Knex.Config = {
	client: 'better-sqlite3',
	useNullAsDefault: true,
	asyncStackTraces: false,
	connection: path.resolve(__dirname, 'sqlite', 'db.sqlite'),
	migrations: {
		extension: 'ts',
		tableName: 'knex_migrations',
		directory: path.resolve(__dirname, './migrations'),
	},
	seeds: { directory: path.resolve(__dirname, './seeds') },
	pool: {
		min: 2,
		max: 20, // Increased max connections to handle higher concurrency
		acquireTimeoutMillis: 30000, // 30 seconds
		createTimeoutMillis: 30000, // 30 seconds
		idleTimeoutMillis: 30000, // 30 seconds
		reapIntervalMillis: 1000, // 1 second
		afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
			try {
				// Enable foreign key constraints
				conn.pragma('foreign_keys = ON');

				// Use Write-Ahead Logging (WAL) for better concurrency
				// WAL mode allows multiple readers and a single writer to operate simultaneously.
				conn.pragma('journal_mode = WAL');

				// Set synchronous mode to NORMAL for a balance between performance and data integrity
				// If you can tolerate a small risk of data loss, you could set this to OFF.
				conn.pragma('synchronous = NORMAL');

				// Adjust the cache size to 20 MB (-20000 KB) to reduce disk I/O
				// Your system has 32 GB of RAM, so allocating 20 MB is reasonable.
				conn.pragma('cache_size = -20000');

				// Store temporary objects in memory for faster operations
				conn.pragma('temp_store = MEMORY');

				// Set a busy timeout of 5000 ms (5 seconds) to reduce contention
				// SQLite will wait for 5 seconds before returning a "database is locked" error.
				conn.pragma('busy_timeout = 5000');

				// Enable multi-threaded operations with 4 threads (matching your CPU's 4 cores)
				// This allows SQLite to utilize all available cores for better performance.
				conn.pragma('threads = 4');

				console.log(`${_getFormattedTimestamp()} INFO: New database connection established`);

				done(null, conn);
			} catch (err) {
				console.error(
					`${_getFormattedTimestamp()} ERROR: Error establishing database connection:`,
					err,
				);

				done(err as Error, conn);
			}
		},
	},
};

if (appConfig.env === 'testing') {
	knexConfig.connection = {
		filename: ':memory:',
	};
}

export default knexConfig;
