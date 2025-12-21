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

    async function verificationReminderTask() {
        context.logger.info('Checking for unverified users...');
        try {
            await context.utils.mail.processVerificationReminders(context.config.app.appUrl);
            context.logger.info('Verification reminder check completed');
        } catch (error: any) {
            context.logger.error('Verification reminder check failed: %o', { error });
        }
    }

    async function screenshotPrefetchTask() {
        context.logger.info('Starting daily screenshot prefetch...');
        try {
            const [bookmarks, actions, tabItems, reminders] = await Promise.all([
                context.db('bookmarks').select('url'),
                context.db('bangs').select('url').where('action_type', 'redirect'),
                context.db('tab_items').select('url'),
                context.db('reminders').select('title', 'content'),
            ]);

            const urls = new Set<string>();

            bookmarks.forEach((b: { url: string }) => {
                if (b.url) urls.add(b.url);
            });

            actions.forEach((a: { url: string }) => {
                if (a.url) urls.add(a.url);
            });

            tabItems.forEach((t: { url: string }) => {
                if (t.url) urls.add(t.url);
            });

            reminders.forEach((r: { title: string; content: string | null }) => {
                if (r.title && context.utils.validation.isUrlLike(r.title)) {
                    urls.add(r.title.startsWith('http') ? r.title : `https://${r.title}`);
                }
                if (r.content && context.utils.validation.isUrlLike(r.content)) {
                    urls.add(r.content.startsWith('http') ? r.content : `https://${r.content}`);
                }
            });

            const urlArray = Array.from(urls);
            context.logger.info(`Prefetching ${urlArray.length} screenshots...`);

            const batchSize = 5;
            const delayBetweenBatches = 2000; // 2 seconds between batches

            for (let i = 0; i < urlArray.length; i += batchSize) {
                const batch = urlArray.slice(i, i + batchSize);
                await Promise.all(
                    batch.map((url) =>
                        fetch(`https://screenshot.jaw.dev?url=${encodeURIComponent(url)}`, {
                            method: 'HEAD',
                            headers: { 'User-Agent': 'Bang/1.0 (https://bang.jaw.dev) Cron' },
                        }).catch(() => {}),
                    ),
                );

                if (i + batchSize < urlArray.length) {
                    await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
                }
            }

            context.logger.info(`Screenshot prefetch completed: ${urlArray.length} URLs processed`);
        } catch (error: any) {
            context.logger.error('Screenshot prefetch failed: %o', { error });
        }
    }

    async function start() {
        const reminderJob = context.libs.cron.schedule(
            // every 15 minutes
            '*/15 * * * *',
            reminderCheckTask,
            {
                timezone: 'UTC',
            },
        );
        cronJobs.push(reminderJob);
        context.logger.info('Reminder check scheduled every 15 minutes');

        const verificationReminderJob = context.libs.cron.schedule(
            // every monday at 9am
            '0 9 * * 1',
            verificationReminderTask,
            {
                timezone: 'UTC',
            },
        );
        cronJobs.push(verificationReminderJob);
        context.logger.info('Verification reminder scheduled for Mondays at 9am UTC');

        const screenshotPrefetchJob = context.libs.cron.schedule(
            // every day at 3am UTC
            '0 3 * * *',
            screenshotPrefetchTask,
            {
                timezone: 'UTC',
            },
        );
        cronJobs.push(screenshotPrefetchJob);
        context.logger.info('Screenshot prefetch scheduled daily at 3am UTC');

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
