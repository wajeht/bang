import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import type { AppContext } from './context';
import { processReminderDigests } from './utils/mail';
import { cleanupExpiredSessions } from './utils/session-cleanup';

export interface CronService {
    start: () => Promise<void>;
    stop: () => void;
    getStatus: () => {
        isRunning: boolean;
        jobCount: number;
    };
}

export function createCronService(dependencies: { logger: AppContext['logger'] }): CronService {
    const { logger } = dependencies;

    let cronJobs: ScheduledTask[] = [];
    let isRunning = false;

    async function reminderCheckTask() {
        logger.info('Checking for due reminders...');
        try {
            await processReminderDigests();
            logger.info('Reminder check completed');
        } catch (error: any) {
            logger.error('Reminder check failed: %o', { error });
        }
    }

    async function sessionCleanupTask() {
        logger.info('Cleaning up expired sessions...');
        try {
            const deletedCount = await cleanupExpiredSessions();
            logger.info(`Session cleanup completed: ${deletedCount} expired sessions removed`);
        } catch (error: any) {
            logger.error('Session cleanup failed: %o', { error });
        }
    }

    async function start() {
        // Schedule reminder check every 15 minutes
        const reminderJob = cron.schedule('*/15 * * * *', reminderCheckTask, {
            timezone: 'UTC',
        });
        cronJobs.push(reminderJob);
        logger.info('Reminder check scheduled every 15 minutes');

        // Schedule session cleanup every 6 hours
        const sessionJob = cron.schedule('0 */6 * * *', sessionCleanupTask, {
            timezone: 'UTC',
        });
        cronJobs.push(sessionJob);
        logger.info('Session cleanup scheduled every 6 hours');

        isRunning = true;
        logger.info(`Cron service started with ${cronJobs.length} job(s)`);
    }

    function stop() {
        cronJobs.forEach((job) => {
            if (job) {
                job.stop();
                job.destroy();
            }
        });
        cronJobs = [];
        isRunning = false;
        logger.info('Cron service stopped');
    }

    function getStatus() {
        return {
            isRunning,
            jobCount: cronJobs.length,
        };
    }

    return {
        start,
        stop,
        getStatus,
    };
}
