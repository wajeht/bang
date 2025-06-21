import knex from 'knex';
import path from 'node:path';
import { logger } from '../logger';
import { config } from '../config';
import knexConfig from './knexfile';
import { attachPaginate } from './paginate';

attachPaginate();

export const db = knex(knexConfig);

export async function optimizeDatabase() {
    try {
        // Update query planner statistics
        await db.raw('ANALYZE');

        // Optimize query planner
        await db.raw('PRAGMA optimize');

        // Vacuum database (non-production only)
        if (config.app.env !== 'production') {
            await db.raw('VACUUM');
        }

        logger.info('Database optimization completed');
    } catch (error) {
        logger.error(`Error optimizing database: %o`, { error });
    }
}

export async function checkDatabaseHealth() {
    try {
        const [walMode] = await db.raw('PRAGMA journal_mode');
        const [cacheSize] = await db.raw('PRAGMA cache_size');
        const [busyTimeout] = await db.raw('PRAGMA busy_timeout');
        const [threads] = await db.raw('PRAGMA threads');
        const [mmapSize] = await db.raw('PRAGMA mmap_size');
        const [syncMode] = await db.raw('PRAGMA synchronous');

        const healthInfo = {
            journalMode: walMode.journal_mode || walMode,
            cacheSize: cacheSize.cache_size || cacheSize,
            busyTimeout: busyTimeout.timeout || busyTimeout,
            threads: threads.threads || threads,
            mmapSize: `${Math.round((mmapSize.mmap_size || mmapSize) / 1024 / 1024)}MB`,
            synchronous:
                (syncMode.synchronous || syncMode) === 1
                    ? 'NORMAL'
                    : (syncMode.synchronous || syncMode) === 0
                      ? 'OFF'
                      : 'FULL',
        };

        logger.info('Database health check: %o', healthInfo);

        return true;
    } catch (error) {
        logger.error(`Database health check failed: %o`, { error });
        return false;
    }
}

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
        logger.error(`error running migrations: %o`, { error });
        throw error;
    }
}
