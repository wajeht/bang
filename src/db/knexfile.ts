import path from 'node:path';
import type { Knex } from 'knex';
import { appConfig } from '../configs';

const developmentEnvironmentOnly = appConfig.env === 'development';

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
	debug: developmentEnvironmentOnly,
	seeds: { directory: path.resolve(__dirname, './seeds') },
	pool: {
		min: 0,
		max: 10,
		afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
			try {
				// Enable foreign key constraints
				conn.pragma('foreign_keys = ON');

				// Use Write-Ahead Logging for better concurrency
				conn.pragma('journal_mode = WAL');

				// Set synchronous mode to NORMAL for better performance
				conn.pragma('synchronous = NORMAL');

				// Adjusts the number of pages in the memory cache
				conn.pragma('cache_size = 10000');

				// Stores temp objects in memory
				conn.pragma('temp_store = MEMORY');

				// Wait for 5000 ms before timing out
				conn.pragma('busy_timeout = 5000');

				// Enable multi-threaded operations (2 threads for 2 CPU cores)
				conn.pragma('threads = 2');

				console.log('New database connection established');

				done(null, conn);
			} catch (err) {
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
