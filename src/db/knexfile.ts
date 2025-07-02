import path from 'node:path';
import { type Knex } from 'knex';
import { config } from '../config';
import { logger } from '../utils/logger';

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
    // debug: _developmentEnvironmentOnly,
    pool: {
        min: 10, // Higher minimum for production server
        max: 100, // Increased max connections
        acquireTimeoutMillis: 60000, // 60 seconds
        createTimeoutMillis: 30000, // 30 seconds
        idleTimeoutMillis: 900000, // 15 minutes
        reapIntervalMillis: 1000, // 1 second
        createRetryIntervalMillis: 100, // Faster retry
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

                // Busy timeout: 45 seconds
                conn.pragma('busy_timeout = 45000');

                // Multi-threaded operations: 4 threads
                conn.pragma('threads = 4');

                // WAL checkpoint every 2000 pages
                conn.pragma('wal_autocheckpoint = 2000');
                conn.pragma('wal_checkpoint(TRUNCATE)');

                // Memory-mapped I/O: 1GB
                conn.pragma('mmap_size = 1073741824');

                // Page size: 4KB
                conn.pragma('page_size = 4096');

                // Lock timeout: 45 seconds
                conn.pragma('lock_timeout = 45000');

                // Temp cache: 100MB
                conn.pragma('temp_cache_size = -100000');

                // Allow concurrent access
                conn.pragma('locking_mode = NORMAL');

                // Faster reads (safe with WAL mode)
                conn.pragma('read_uncommitted = 1');

                // Optimize query planner
                conn.pragma('optimize');

                logger.info('New database connection established');

                done(null, conn);
            } catch (err) {
                logger.error('Error establishing database connection: %o', { error: err });
                done(err as Error, conn);
            }
        },
    },
};

if (config.app.env === 'testing') {
    knexConfig.connection = {
        filename: ':memory:',
    };
}

export default knexConfig;
