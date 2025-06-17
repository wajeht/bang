import knex from 'knex';
import path from 'node:path';
import { logger } from '../logger';
import { config } from '../config';
import knexConfig from './knexfile';
import { attachPaginate } from 'knex-paginate';

attachPaginate();

export const db = knex(knexConfig);

export async function runMigrations(force: boolean = false) {
    try {
        if (config.app.env !== 'production' && force !== true) {
            logger.info('cannot run auto database migration on non production');
            return;
        }

        const dbConfig = {
            directory: path.resolve(path.join(process.cwd(), 'dist', 'src', 'db', 'migrations')),
        };

        if (config.app.env !== 'production') {
            dbConfig.directory = path.resolve(path.join(process.cwd(), 'src', 'db', 'migrations'));
        }

        const version = await db.migrate.currentVersion();

        logger.info(`current database version ${version}`);

        logger.info(`checking for database upgrades`);

        const [batchNo, migrations] = await db.migrate.latest(dbConfig);

        if (migrations.length === 0) {
            logger.info('database upgrade not required');
            return;
        }

        const migrationList = migrations
            .map((migration: string) => migration.split('_')[1]?.split('.')[0] ?? '')
            .join(', ');

        logger.info(`database upgrades completed for ${migrationList} schema`);

        logger.info(`batch ${batchNo} run: ${migrations.length} migrations`);
    } catch (error) {
        logger.error('error running migrations', error);
        throw error;
    }
}
