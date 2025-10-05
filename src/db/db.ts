import path from 'node:path';
import knex, { Knex } from 'knex';
import { config } from '../config';
import knexConfig from './knexfile';
import { logger } from '../utils/logger';
import { attachPaginate } from './paginate';

let _db: Knex | null = null;

function _createKnexInstance() {
    if (_db) {
        return _db;
    }
    _db = knex(knexConfig);
    attachPaginate();
    return _db;
}

export const db = _createKnexInstance();

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

export async function inittializeDatabase() {
    try {
        await checkDatabaseHealth();
        await optimizeDatabase();
        await runProductionMigration();
        logger.info('Database migrations completed successfully');
    } catch (error: any) {
        logger.error('Error while initalizing databse: %o', { error });
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

        logger.table(healthInfo);

        return true;
    } catch (error) {
        logger.error(`Database health check failed: %o`, { error });
        return false;
    }
}

export async function runProductionMigration(force: boolean = false) {
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

        logger.info('checking for database upgrades');
        logger.info(`looking for migrations in: ${dbConfig.directory}`);

        const [batchNo, migrations] = await db.migrate.latest(dbConfig);

        if (migrations.length === 0) {
            logger.info('database upgrade not required');
            return;
        }

        migrations.forEach((migration: string) => {
            logger.info(`running migration file: ${migration}`);
        });

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
