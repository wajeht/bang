import type { AppContext } from './type';
import { type ScheduledTask } from 'node-cron';

export interface CronService {
    start: () => Promise<void>;
    stop: () => void;
    getStatus: () => { isRunning: boolean; jobCount: number };
}

export function createCronService(context: AppContext): CronService {
    let cronJobs: ScheduledTask[] = [];
    let isRunning = false;

    async function reminderCheckTask() {
        const log = context.logger.tag('job', 'reminder-check');
        const timer = log.time('job');
        try {
            await context.utils.mail.processReminderDigests();
            timer.stop({ status: 'success' });
        } catch (error) {
            log.error('job failed', { error });
        }
    }

    async function verificationReminderTask() {
        const log = context.logger.tag('job', 'verification-reminder');
        const timer = log.time('job');
        try {
            await context.utils.mail.processVerificationReminders(context.config.app.appUrl);
            timer.stop({ status: 'success' });
        } catch (error) {
            log.error('job failed', { error });
        }
    }

    async function screenshotPrefetchTask() {
        const log = context.logger.tag('job', 'screenshot-prefetch');
        const timer = log.time('job');
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
            const batchSize = 5;
            const delayBetweenBatches = 2000;

            for (let i = 0; i < urlArray.length; i += batchSize) {
                const batch = urlArray.slice(i, i + batchSize);
                await Promise.allSettled(
                    batch.map(async (url) => {
                        const controller = new AbortController();
                        const timeout = setTimeout(() => controller.abort(), 10000);
                        try {
                            const response = await fetch(
                                `https://screenshot.jaw.dev?url=${encodeURIComponent(url)}`,
                                {
                                    method: 'HEAD',
                                    headers: {
                                        'User-Agent': 'Bang/1.0 (https://bang.jaw.dev) Cron',
                                    },
                                    signal: controller.signal,
                                },
                            );
                            await response.text().catch(() => {});
                        } catch {
                            // Ignore fetch errors
                        } finally {
                            clearTimeout(timeout);
                        }
                    }),
                );

                if (i + batchSize < urlArray.length) {
                    await new Promise((resolve) => setTimeout(resolve, delayBetweenBatches));
                }
            }

            timer.stop({ status: 'success', urls: urlArray.length });
        } catch (error) {
            log.error('job failed', { error });
        }
    }

    async function start() {
        const log = context.logger.tag('service', 'cron');

        // every 15 minutes
        cronJobs.push(
            context.libs.cron.schedule('*/15 * * * *', reminderCheckTask, { timezone: 'UTC' }),
        );

        // every monday at 9am
        cronJobs.push(
            context.libs.cron.schedule('0 9 * * 1', verificationReminderTask, { timezone: 'UTC' }),
        );

        // every day at 3am UTC
        cronJobs.push(
            context.libs.cron.schedule('0 3 * * *', screenshotPrefetchTask, { timezone: 'UTC' }),
        );

        isRunning = true;
        log.info('started', { jobs: cronJobs.length });
    }

    function stop() {
        cronJobs.forEach((job) => {
            job.stop();
            job.destroy();
        });
        cronJobs = [];
        isRunning = false;
        context.logger.tag('service', 'cron').info('stopped');
    }

    function getStatus() {
        return { isRunning, jobCount: cronJobs.length };
    }

    return { start, stop, getStatus };
}
