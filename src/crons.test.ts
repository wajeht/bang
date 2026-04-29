import {
    createCronService,
    screenshotPrefetchTask,
    PREFETCH_RECENT_DAYS,
    PREFETCH_PER_TABLE_LIMIT,
    PREFETCH_REMINDERS_LIMIT,
} from './crons.js';
import { createContext } from './context.js';
import { db } from './tests/test-setup.js';
import type { AppContext } from './type.js';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

describe('cron service', () => {
    let ctx: AppContext;
    let service: ReturnType<typeof createCronService>;
    let originalFetch: typeof globalThis.fetch;
    let fetchedUrls: string[];

    beforeAll(async () => {
        ctx = await createContext();
    });

    beforeEach(async () => {
        service = createCronService(ctx);
        fetchedUrls = [];
        originalFetch = globalThis.fetch;
        globalThis.fetch = vi.fn(async (input: any) => {
            fetchedUrls.push(typeof input === 'string' ? input : input.url);
            return new Response('', { status: 200 });
        }) as any;

        await db('bookmarks').delete();
        await db('bangs').delete();
        await db('tab_items').delete();
        await db('tabs').delete();
        await db('reminders').delete();
    });

    afterEach(() => {
        globalThis.fetch = originalFetch;
        service.stop();
    });

    describe('lifecycle', () => {
        it('should report 0 jobs before start, 3 after start, 0 after stop', async () => {
            expect(service.getStatus()).toEqual({ isRunning: false, jobCount: 0 });

            await service.start();
            expect(service.getStatus()).toEqual({ isRunning: true, jobCount: 3 });

            service.stop();
            expect(service.getStatus()).toEqual({ isRunning: false, jobCount: 0 });
        });

        it('should be idempotent on stop', () => {
            expect(() => service.stop()).not.toThrow();
            expect(service.getStatus().jobCount).toBe(0);
        });
    });

    describe('screenshotPrefetchTask: recency filter + limit', () => {
        it('should ignore rows older than the recency cutoff', async () => {
            const old = ctx.libs.dayjs
                .utc()
                .subtract(PREFETCH_RECENT_DAYS + 5, 'day')
                .toISOString();
            const recent = ctx.libs.dayjs.utc().subtract(1, 'hour').toISOString();

            await db('bookmarks').insert([
                {
                    user_id: 1,
                    url: 'https://old-bookmark.example.com',
                    title: 'old',
                    created_at: old,
                    updated_at: old,
                },
                {
                    user_id: 1,
                    url: 'https://recent-bookmark.example.com',
                    title: 'recent',
                    created_at: recent,
                    updated_at: recent,
                },
            ]);

            await screenshotPrefetchTask(ctx);

            const hitOld = fetchedUrls.some((u) => u.includes('old-bookmark'));
            const hitRecent = fetchedUrls.some((u) => u.includes('recent-bookmark'));
            expect(hitOld).toBe(false);
            expect(hitRecent).toBe(true);
        });

        it('should fetch every recent bookmark when count is well under the limit', async () => {
            const recent = ctx.libs.dayjs.utc().subtract(1, 'hour').toISOString();
            const rows = Array.from({ length: 10 }, (_, i) => ({
                user_id: 1,
                url: `https://bm-${i}.example.com`,
                title: `t${i}`,
                created_at: recent,
                updated_at: recent,
            }));
            await db('bookmarks').insert(rows);

            await screenshotPrefetchTask(ctx);

            for (let i = 0; i < 10; i++) {
                expect(fetchedUrls.some((u) => u.includes(`bm-${i}.example`))).toBe(true);
            }
        });

        it('should deduplicate URLs that appear in multiple tables', async () => {
            const recent = ctx.libs.dayjs.utc().subtract(1, 'hour').toISOString();
            const dup = 'https://dup.example.com';

            await db('bookmarks').insert({
                user_id: 1,
                url: dup,
                title: 'dup',
                created_at: recent,
                updated_at: recent,
            });
            await db('bangs').insert({
                user_id: 1,
                trigger: '!dup',
                name: 'dup',
                action_type: 'redirect',
                url: dup,
                created_at: recent,
                updated_at: recent,
            });

            await screenshotPrefetchTask(ctx);

            const occurrences = fetchedUrls.filter((u) => u.includes('dup.example')).length;
            expect(occurrences).toBe(1);
        });

        it('should not fetch search-type bangs (only redirect)', async () => {
            const recent = ctx.libs.dayjs.utc().subtract(1, 'hour').toISOString();
            await db('bangs').insert([
                {
                    user_id: 1,
                    trigger: '!s',
                    name: 'search',
                    action_type: 'search',
                    url: 'https://search-only.example.com/?q={{{s}}}',
                    created_at: recent,
                    updated_at: recent,
                },
                {
                    user_id: 1,
                    trigger: '!r',
                    name: 'redirect',
                    action_type: 'redirect',
                    url: 'https://redirect.example.com',
                    created_at: recent,
                    updated_at: recent,
                },
            ]);

            await screenshotPrefetchTask(ctx);

            expect(fetchedUrls.some((u) => u.includes('search-only.example'))).toBe(false);
            expect(fetchedUrls.some((u) => u.includes('redirect.example'))).toBe(true);
        });

        it('should swallow database errors without crashing the cron', async () => {
            const brokenCtx = {
                ...ctx,
                db: () => {
                    throw new Error('synthetic db error');
                },
                logger: {
                    tag: () => ({
                        time: () => ({ stop: () => {} }),
                        error: () => {},
                        info: () => {},
                    }),
                },
            } as unknown as AppContext;

            await expect(screenshotPrefetchTask(brokenCtx)).resolves.toBeUndefined();
        });
    });

    describe('configuration', () => {
        it('should expose stable prefetch limits', () => {
            expect(PREFETCH_RECENT_DAYS).toBe(7);
            expect(PREFETCH_PER_TABLE_LIMIT).toBe(5000);
            expect(PREFETCH_REMINDERS_LIMIT).toBe(2000);
        });
    });
});
