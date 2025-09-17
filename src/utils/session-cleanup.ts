import { db } from '../db/db';
import { logger } from './logger';

export async function cleanupExpiredSessions(): Promise<number> {
    try {
        const result = await db('sessions').where('expired', '<', new Date()).del();

        logger.info(`Cleaned up ${result} expired sessions`);
        return result;
    } catch (error) {
        logger.error('Failed to cleanup expired sessions: %o', { error });
        throw error;
    }
}

export async function cleanupOldSessions(olderThanDays = 30): Promise<number> {
    try {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - olderThanDays);

        const result = await db('sessions').where('expired', '<', cutoffDate).del();

        logger.info(`Cleaned up ${result} sessions older than ${olderThanDays} days`);
        return result;
    } catch (error) {
        logger.error(`Failed to cleanup sessions older than ${olderThanDays} days: %o`, { error });
        throw error;
    }
}

export async function getSessionStats() {
    try {
        const [total, expired, active] = await Promise.all([
            db('sessions').count('* as count').first(),
            db('sessions').where('expired', '<', new Date()).count('* as count').first(),
            db('sessions').where('expired', '>=', new Date()).count('* as count').first(),
        ]);

        return {
            total: total?.count || 0,
            expired: expired?.count || 0,
            active: active?.count || 0,
        };
    } catch (error) {
        logger.error('Failed to get session stats: %o', { error });
        throw error;
    }
}
