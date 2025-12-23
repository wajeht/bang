import path from 'node:path';
import type { Knex } from 'knex';
import { Logger } from '../utils/logger';
import { CustomMigrationSource } from './migration-source';

const logger = Logger();
const isTesting = process.env.NODE_ENV === 'testing' || process.env.APP_ENV === 'testing';

const migrationsPath = path.resolve(__dirname, 'migrations');

let knexConfig: Knex.Config = {
    client: 'better-sqlite3',
    useNullAsDefault: true,
    asyncStackTraces: false,
    connection: path.resolve(__dirname, 'sqlite', 'db.sqlite'),
    migrations: {
        migrationSource: new CustomMigrationSource(migrationsPath),
        tableName: 'knex_migrations',
    },
    seeds: { directory: path.resolve(__dirname, './seeds') },
    // debug: _developmentEnvironmentOnly,
    pool: {
        min: 0, // No idle connections for SQLite
        max: 1, // Only 1 connection per container (SQLite is single-file)
        acquireTimeoutMillis: 120000, // 2 minutes (increased for lock contention)
        createTimeoutMillis: 30000, // 30 seconds
        idleTimeoutMillis: 30000, // 30 seconds (close idle connections quickly)
        reapIntervalMillis: 1000, // 1 second
        createRetryIntervalMillis: 200, // Retry every 200ms
        propagateCreateError: false, // Don't fail immediately on connection errors
        afterCreate: (conn: any, done: (err: Error | null, conn: any) => void) => {
            try {
                // Enable foreign key constraints
                conn.pragma('foreign_keys = ON');

                // Use Write-Ahead Logging (WAL) for better concurrency
                conn.pragma('journal_mode = WAL');

                // Set synchronous mode to NORMAL for balance between performance and data integrity
                conn.pragma('synchronous = NORMAL');

                // Cache size: 500 MB
                conn.pragma('cache_size = -500000');

                // Store temporary objects in memory
                conn.pragma('temp_store = MEMORY');

                // Busy timeout: 2 minutes (critical for multi-container SQLite)
                conn.pragma('busy_timeout = 120000');

                // Multi-threaded operations: 4 threads
                conn.pragma('threads = 4');

                // WAL checkpoint every 4000 pages (less frequent = better concurrency)
                conn.pragma('wal_autocheckpoint = 4000');

                // Don't truncate on every connection (causes locks)
                // conn.pragma('wal_checkpoint(TRUNCATE)');

                // Memory-mapped I/O: 1GB
                conn.pragma('mmap_size = 1073741824');

                // Page size: 4KB
                conn.pragma('page_size = 4096');

                // Lock timeout: 2 minutes (matches busy_timeout)
                conn.pragma('lock_timeout = 120000');

                // Temp cache: 100MB
                conn.pragma('temp_cache_size = -100000');

                // Allow concurrent access
                conn.pragma('locking_mode = NORMAL');

                // Faster reads (safe with WAL mode)
                conn.pragma('read_uncommitted = 1');

                // Optimize query planner
                conn.pragma('optimize');

                if (!isTesting) {
                    logger.info('New database connection established');
                }

                done(null, conn);
            } catch (err: any) {
                logger.error('Error establishing database connection: %o', { error: err });
                done(err as Error, conn);
            }
        },
    },
};

if (isTesting) {
    knexConfig = {
        ...knexConfig,
        connection: {
            filename: ':memory:',
        },
    };
}

export default knexConfig;
