import path from 'node:path';
import type { Knex } from 'knex';
import { databaseConfig, appConfig } from '../configs';

const developmentEnvironmentOnly = appConfig.env === 'development';

const knexConfig: Knex.Config = {
	client: 'pg',
	connection: {
		database: databaseConfig.database,
		host: databaseConfig.host,
		user: databaseConfig.username,
		password: databaseConfig.password,
	},
	migrations: {
		extension: 'ts',
		tableName: 'knex_migrations',
		directory: path.resolve(__dirname, './migrations'),
	},
	// debug: developmentEnvironmentOnly,
	seeds: { directory: path.resolve(__dirname, './seeds') },
	pool: {
		min: 0,
		max: 10,
		afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
			console.log('New database connection established');
			done(null, conn);
		},
	},
};

if (appConfig.env === 'testing') {
	knexConfig.connection = {
		filename: ':memory:',
	};
}

export default knexConfig;
