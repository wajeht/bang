import type { Knex } from 'knex';
import type { Logger } from '../type';

export function SessionCleanupUtils(deps: { db: Knex; logger: Logger }) {
    async function cleanupExpiredSessions(): Promise<number> {
        try {
            const result = await deps.db('sessions').where('expired', '<', new Date()).del();

            deps.logger.info(`Cleaned up ${result} expired sessions`);
            return result;
        } catch (error) {
            deps.logger.error('Failed to cleanup expired sessions: %o', { error });
            throw error;
        }
    }

    async function cleanupOldSessions(olderThanDays = 30): Promise<number> {
        try {
            const cutoffDate = new Date();
            cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

            const result = await deps.db('sessions').where('expired', '<', cutoffDate).del();

            deps.logger.info(`Cleaned up ${result} sessions older than ${olderThanDays} days`);
            return result;
        } catch (error) {
            deps.logger.error(`Failed to cleanup sessions older than ${olderThanDays} days: %o`, {
                error,
            });
            throw error;
        }
    }

    async function getSessionStats() {
        try {
            const [total, expired, active] = await Promise.all([
                deps.db('sessions').count('* as count').first(),
                deps.db('sessions').where('expired', '<', new Date()).count('* as count').first(),
                deps.db('sessions').where('expired', '>=', new Date()).count('* as count').first(),
            ]);

            return {
                total: total?.count || 0,
                expired: expired?.count || 0,
                active: active?.count || 0,
            };
        } catch (error) {
            deps.logger.error('Failed to get session stats: %o', { error });
            throw error;
        }
    }

    return {
        cleanupExpiredSessions,
        cleanupOldSessions,
        getSessionStats,
    };
}
