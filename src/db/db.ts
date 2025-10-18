import path from 'node:path';
import type { Knex } from 'knex';
import knexConfig from './knexfile';
import type { Config, Logger } from '../type';
import type { Libs } from '../libs';

export interface PaginationOptions {
    perPage?: number;
    currentPage?: number;
    isLengthAware?: boolean;
}

export interface PaginationResult<T = unknown> {
    data: T[];
    pagination: {
        perPage: number;
        currentPage: number;
        from: number;
        to: number;
        total?: number;
        lastPage?: number;
        hasNext?: boolean;
        hasPrev?: boolean;
    };
}

declare module 'knex' {
    // eslint-disable-next-line @typescript-eslint/no-namespace
    namespace Knex {
        interface QueryBuilder {
            paginate(options?: PaginationOptions): Promise<PaginationResult>;
        }
    }
}

let _db: Knex | null = null;

function attachPaginate(knex: typeof import('knex')) {
    async function paginate(
        this: Knex.QueryBuilder,
        { perPage = 10, currentPage = 1, isLengthAware = false }: PaginationOptions = {},
    ): Promise<PaginationResult> {
        perPage = Math.max(1, Math.floor(perPage));
        currentPage = Math.max(1, Math.floor(currentPage));

        const offset = (currentPage - 1) * perPage;

        const data = await this.clone().offset(offset).limit(perPage);

        const pagination: PaginationResult['pagination'] = {
            perPage,
            currentPage,
            from: offset + 1,
            to: offset + data.length,
            hasNext: data.length === perPage,
            hasPrev: currentPage > 1,
        };

        if (isLengthAware) {
            const countQuery = this.clone().clearSelect().clearOrder().count('* as total').first();
            const countResult = await countQuery;
            const total = +(countResult?.total || 0);

            pagination.total = total;
            pagination.lastPage = Math.ceil(total / perPage);
            pagination.hasNext = currentPage < pagination.lastPage;
        }

        return { data, pagination };
    }

    try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (knex as any).QueryBuilder.extend('paginate', paginate);
    } catch (error) {
        console.error('Error attaching paginate method to Knex QueryBuilder:', error);
    }
}

function _createKnexInstance(libs: Libs): Knex {
    if (_db) {
        return _db;
    }
    _db = libs.knex(knexConfig);
    attachPaginate(libs.knex);
    return _db;
}

export function Database(deps: { config: Config; logger: Logger; libs: Libs }) {
    const db: Knex = _createKnexInstance(deps.libs);

    async function optimizeDatabase() {
        try {
            await db.raw('ANALYZE');
            await db.raw('PRAGMA optimize');
            if (deps.config.app.env !== 'production') {
                await db.raw('VACUUM');
            }

            deps.logger.info('Database optimization completed');
        } catch (error) {
            deps.logger.error(`Error optimizing database: %o`, { error });
        }
    }

    async function inittializeDatabase() {
        try {
            await checkDatabaseHealth();
            await optimizeDatabase();
            await runProductionMigration();
            deps.logger.info('Database migrations completed successfully');
        } catch (error) {
            deps.logger.error('Error while initalizing databse: %o', { error });
        }
    }

    async function checkDatabaseHealth() {
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

            deps.logger.table(healthInfo);

            return true;
        } catch (error) {
            deps.logger.error(`Database health check failed: %o`, { error });
            return false;
        }
    }

    async function runProductionMigration(force: boolean = false) {
        try {
            if (deps.config.app.env !== 'production' && force !== true) {
                deps.logger.info('cannot run auto database migration on non production');
                return;
            }

            const dbConfig = {
                directory: path.resolve(
                    path.join(process.cwd(), 'dist', 'src', 'db', 'migrations'),
                ),
            };

            if (deps.config.app.env !== 'production') {
                dbConfig.directory = path.resolve(
                    path.join(process.cwd(), 'src', 'db', 'migrations'),
                );
            }

            const version = await db.migrate.currentVersion();
            deps.logger.info(`current database version ${version}`);

            deps.logger.info('checking for database upgrades');
            deps.logger.info(`looking for migrations in: ${dbConfig.directory}`);

            const [batchNo, migrations] = await db.migrate.latest(dbConfig);

            if (migrations.length === 0) {
                deps.logger.info('database upgrade not required');
                return;
            }

            migrations.forEach((migration: string) => {
                deps.logger.info(`running migration file: ${migration}`);
            });

            const migrationList = migrations
                .map((migration: string) => migration.split('_')[1]?.split('.')[0] ?? '')
                .join(', ');

            deps.logger.info(`database upgrades completed for ${migrationList} schema`);
            deps.logger.info(`batch ${batchNo} run: ${migrations.length} migrations`);
        } catch (error) {
            deps.logger.error(`error running migrations: %o`, { error });
            throw error;
        }
    }

    return {
        instance: db,
        optimizeDatabase,
        inittializeDatabase,
        checkDatabaseHealth,
        runProductionMigration,
    };
}
