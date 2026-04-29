import { knexConfig } from './knexfile';
import { describe, it, expect } from 'vite-plus/test';

describe('knexfile', () => {
    it('should configure the SQLite client', () => {
        expect(knexConfig.client).toBe('better-sqlite3');
        expect(knexConfig.useNullAsDefault).toBe(true);
    });

    describe('connection pool', () => {
        it('should fail fast on contention rather than queueing requests for minutes', () => {
            // Acquire timeout was lowered from 120000ms (2 min) to 15000ms (15s) so a stuck
            // SQLite write does not stall every other request for 2 minutes.
            expect(knexConfig.pool?.acquireTimeoutMillis).toBe(15000);
        });

        it('should keep one connection per process (SQLite is single-writer)', () => {
            expect(knexConfig.pool?.min).toBe(0);
            expect(knexConfig.pool?.max).toBe(1);
        });

        it('should configure a non-zero create timeout and idle timeout', () => {
            expect(knexConfig.pool?.createTimeoutMillis).toBeGreaterThan(0);
            expect(knexConfig.pool?.idleTimeoutMillis).toBeGreaterThan(0);
        });
    });
});
