import type { AppContext } from './type';
import { type ScheduledTask } from 'node-cron';

export interface CronService {
    start: () => Promise<void>;
    stop: () => void;
    getStatus: () => {
        isRunning: boolean;
        jobCount: number;
    };
}

export function CronService(context: AppContext): CronService {
    let cronJobs: ScheduledTask[] = [];
    let isRunning = false;

    async function reminderCheckTask() {
        context.logger.info('Checking for due reminders...');
        try {
            await context.utils.mail.processReminderDigests();
            context.logger.info('Reminder check completed');
        } catch (error: any) {
            context.logger.error('Reminder check failed: %o', { error });
        }
    }

    async function start() {
        // Schedule reminder check every 15 minutes
        const reminderJob = context.libs.cron.schedule('*/15 * * * *', reminderCheckTask, {
            timezone: 'UTC',
        });
        cronJobs.push(reminderJob);
        context.logger.info('Reminder check scheduled every 15 minutes');

        isRunning = true;
        context.logger.info(`Cron service started with ${cronJobs.length} job(s)`);
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
        context.logger.info('Cron service stopped');
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
