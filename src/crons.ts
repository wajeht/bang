import type { AppContext } from './type';
import { type ScheduledTask } from 'node-cron';

export const PREFETCH_RECENT_DAYS = 7;
export const PREFETCH_PER_TABLE_LIMIT = 5000;
export const PREFETCH_REMINDERS_LIMIT = 2000;
const PREFETCH_BATCH_SIZE = 5;
const PREFETCH_BATCH_DELAY_MS = 2000;
const PREFETCH_REQUEST_TIMEOUT_MS = 10000;

export interface CronService {
    start: () => Promise<void>;
    stop: () => void;
    getStatus: () => { isRunning: boolean; jobCount: number };
}

export async function reminderCheckTask(context: AppContext): Promise<void> {
    const log = context.logger.tag('job', 'reminder-check');
    const timer = log.time('job');
    try {
        await context.utils.mail.processReminderDigests();
        timer.stop({ status: 'success' });
    } catch (error) {
        log.error('job failed', { error });
    }
}

export async function verificationReminderTask(context: AppContext): Promise<void> {
    const log = context.logger.tag('job', 'verification-reminder');
    const timer = log.time('job');
    try {
        await context.utils.mail.processVerificationReminders(context.config.app.appUrl);
        timer.stop({ status: 'success' });
    } catch (error) {
        log.error('job failed', { error });
    }
}

export async function screenshotPrefetchTask(context: AppContext): Promise<void> {
    const log = context.logger.tag('job', 'screenshot-prefetch');
    const timer = log.time('job');
    try {
        const recentCutoff = context.libs.dayjs
            .utc()
            .subtract(PREFETCH_RECENT_DAYS, 'day')
            .toISOString();

        const [bookmarks, actions, tabItems, reminders] = await Promise.all([
            context
                .db('bookmarks')
                .select('url')
                .where('updated_at', '>', recentCutoff)
                .limit(PREFETCH_PER_TABLE_LIMIT),
            context
                .db('bangs')
                .select('url')
                .where('action_type', 'redirect')
                .where('updated_at', '>', recentCutoff)
                .limit(PREFETCH_PER_TABLE_LIMIT),
            context
                .db('tab_items')
                .select('url')
                .where('updated_at', '>', recentCutoff)
                .limit(PREFETCH_PER_TABLE_LIMIT),
            context
                .db('reminders')
                .select('title', 'content')
                .where('updated_at', '>', recentCutoff)
                .limit(PREFETCH_REMINDERS_LIMIT),
        ]);

        const urls = new Set<string>();

        for (const b of bookmarks) {
            if (b.url) urls.add(b.url);
        }

        for (const a of actions) {
            if (a.url) urls.add(a.url);
        }

        for (const t of tabItems) {
            if (t.url) urls.add(t.url);
        }

        for (const r of reminders) {
            if (r.title && context.utils.validation.isUrlLike(r.title)) {
                urls.add(r.title.startsWith('http') ? r.title : `https://${r.title}`);
            }
            if (r.content && context.utils.validation.isUrlLike(r.content)) {
                urls.add(r.content.startsWith('http') ? r.content : `https://${r.content}`);
            }
        }

        const urlArray = Array.from(urls);

        for (let i = 0; i < urlArray.length; i += PREFETCH_BATCH_SIZE) {
            const batch = urlArray.slice(i, i + PREFETCH_BATCH_SIZE);
            await Promise.allSettled(
                batch.map(async (url) => {
                    const controller = new AbortController();
                    const timeout = setTimeout(
                        () => controller.abort(),
                        PREFETCH_REQUEST_TIMEOUT_MS,
                    );
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

            if (i + PREFETCH_BATCH_SIZE < urlArray.length) {
                await new Promise((resolve) => setTimeout(resolve, PREFETCH_BATCH_DELAY_MS));
            }
        }

        timer.stop({ status: 'success', urls: urlArray.length });
    } catch (error) {
        log.error('job failed', { error });
    }
}

export function createCronService(context: AppContext): CronService {
    let cronJobs: ScheduledTask[] = [];
    let isRunning = false;

    async function start() {
        const log = context.logger.tag('service', 'cron');

        // every 15 minutes
        cronJobs.push(
            context.libs.cron.schedule('*/15 * * * *', () => reminderCheckTask(context), {
                timezone: 'UTC',
            }),
        );

        // every monday at 9am
        cronJobs.push(
            context.libs.cron.schedule('0 9 * * 1', () => verificationReminderTask(context), {
                timezone: 'UTC',
            }),
        );

        // every day at 3am UTC
        cronJobs.push(
            context.libs.cron.schedule('0 3 * * *', () => screenshotPrefetchTask(context), {
                timezone: 'UTC',
            }),
        );

        isRunning = true;
        log.info('started', { jobs: cronJobs.length });
    }

    function stop() {
        for (const job of cronJobs) {
            void job.stop();
            void job.destroy();
        }
        cronJobs = [];
        isRunning = false;
        context.logger.tag('service', 'cron').info('stopped');
    }

    function getStatus() {
        return { isRunning, jobCount: cronJobs.length };
    }

    return { start, stop, getStatus };
}
