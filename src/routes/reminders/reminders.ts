import type { AppContext, HonoContext, AppEnv, User } from '../../type.js';
import { setFlash } from '../middleware.js';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

export function createRemindersRouter(ctx: AppContext) {
    const router = new Hono<AppEnv>();

    const reminderFormSchema = z.object({
        title: z.string('Title is required').min(1, 'Title is required'),
        content: z.string().optional(),
        when: z.string('When is required').min(1, 'When is required'),
        custom_date: z.string().optional(),
        custom_time: z
            .string()
            .optional()
            .refine(
                (value) => !value || ctx.utils.validation.isValidClockTime(value),
                'Invalid time format. Must be HH:MM (24-hour format)',
            ),
    });

    const reminderBookmarkSchema = z.object({
        title: z.string('Title is required').min(1, 'Title is required'),
        url: z
            .string('URL is required')
            .min(1, 'URL is required')
            .refine((value) => ctx.utils.validation.isValidUrl(value), 'Invalid URL format'),
        pinned: z
            .union([z.boolean(), z.literal('on')], 'Pinned must be a boolean or checkbox value')
            .optional(),
        delete_reminder: z.unknown().optional(),
    });

    router.get('/reminders/create', ctx.middleware.authentication, async (c) => {
        return c.render('reminders/reminders-new.html', {
            title: 'Reminders / New',
            path: '/reminders/create',
            layout: '_layouts/auth.html',
            user: c.get('user'),
            timingOptions: ctx.utils.search.reminderTimingConfig.getAllOptions(),
        });
    });

    router.get('/reminders/:id/edit', ctx.middleware.authentication, async (c) => {
        const user = c.get('user') as User;
        const reminderId = parseInt(c.req.param('id') ?? '', 10);

        const reminder = await ctx.models.reminders.read(reminderId, user.id);

        if (!reminder) {
            throw new ctx.errors.NotFoundError('Reminder not found');
        }

        return c.render('reminders/reminders-edit.html', {
            title: 'Reminders / Edit',
            path: `/reminders/${reminderId}/edit`,
            layout: '_layouts/auth.html',
            user: c.get('user'),
            reminder,
            timingOptions: ctx.utils.search.reminderTimingConfig.getAllOptions(),
        });
    });

    router.get('/reminders/:id/bookmarks/create', ctx.middleware.authentication, async (c) => {
        const user = c.get('user') as User;
        const reminderId = parseInt(c.req.param('id') ?? '', 10);

        const reminder = await ctx.models.reminders.read(reminderId, user.id);

        if (!reminder) {
            throw new ctx.errors.NotFoundError('Reminder not found');
        }

        return c.render('reminders/reminders-bookmarks-new.html', {
            title: `Reminders / ${reminderId} / Bookmarks / Create`,
            path: `/reminders/${reminderId}/bookmarks/create`,
            layout: '_layouts/auth.html',
            user: c.get('user'),
            reminder,
        });
    });

    router.post(
        '/reminders/:id/bookmarks',
        ctx.middleware.authentication,
        zValidator('form', reminderBookmarkSchema, (result) => {
            if (!result.success) {
                const errors: Record<string, string> = {};
                for (const issue of result.error.issues) {
                    errors[String(issue.path[0] ?? 'general')] ??= issue.message;
                }
                throw new ctx.errors.ValidationError(errors);
            }
        }),
        async (c) => {
            const user = c.get('user') as User;
            const reminderId = parseInt(c.req.param('id') ?? '', 10);
            const { url, title, pinned, delete_reminder } = c.req.valid('form');

            const reminder = await ctx.models.reminders.read(reminderId, user.id);

            if (!reminder) {
                throw new ctx.errors.NotFoundError('Reminder not found');
            }

            const existingBookmark = await ctx.utils.util.checkDuplicateBookmarkUrl(
                user.id,
                url,
                title || '',
            );

            if (existingBookmark) {
                throw new ctx.errors.ValidationError({
                    url: `URL already bookmarked as "${existingBookmark.title}". Please use a different URL or update the existing bookmark.`,
                });
            }

            void ctx.utils.util
                .insertBookmark({
                    url,
                    userId: user.id,
                    title,
                    pinned: pinned === 'on' || pinned === true,
                })
                .catch((error) => ctx.logger.error('Failed to insert bookmark', { error }));

            // Delete reminder if requested
            if (delete_reminder === 'on' || delete_reminder === true) {
                await ctx.models.reminders.delete([reminderId], user.id);
            }

            const successMessage =
                delete_reminder === 'on' || delete_reminder === true
                    ? `Bookmark ${title} created successfully and reminder deleted!`
                    : `Bookmark ${title} created successfully!`;

            setFlash(c, 'success', successMessage);
            return c.redirect('/reminders');
        },
    );

    router.post('/reminders/recalculate', ctx.middleware.authentication, async (c) => {
        const user = c.get('user') as User;

        try {
            const recurringReminders = await ctx
                .db('reminders')
                .where({
                    user_id: user.id,
                    reminder_type: 'recurring',
                })
                .whereNotNull('frequency');

            if (recurringReminders.length === 0) {
                setFlash(c, 'warning', "You don't have any recurring reminders at the moment!");
                return c.redirect('/reminders');
            }

            const updates: { id: number; due_date: string }[] = [];
            for (const reminder of recurringReminders) {
                const timing = ctx.utils.search.parseReminderTiming(
                    reminder.frequency.toLowerCase(),
                    user.column_preferences?.reminders?.default_reminder_time,
                    user.timezone,
                );

                if (timing.isValid && timing.nextDue) {
                    updates.push({
                        id: reminder.id,
                        due_date:
                            timing.nextDue instanceof Date
                                ? timing.nextDue.toISOString()
                                : timing.nextDue,
                    });
                }
            }

            if (updates.length > 0) {
                await ctx.db.transaction(async (trx) => {
                    for (const update of updates) {
                        await trx('reminders')
                            .where({ id: update.id })
                            .update({ due_date: update.due_date, updated_at: trx.fn.now() });
                    }
                });
            }

            setFlash(c, 'success', `Recalculated ${recurringReminders.length} reminders`);
        } catch {
            setFlash(c, 'error', 'Failed to recalculate reminders');
        }

        return c.redirect('/reminders');
    });

    router.get('/reminders', ctx.middleware.authentication, getRemindersHandler);
    async function getRemindersHandler(c: HonoContext) {
        const user = c.get('user') as User;
        const { perPage, page, search, sortKey, direction } =
            ctx.utils.request.extractPaginationParamsFromContext(c, 'reminders');

        const { data: remindersData, pagination } = await ctx.models.reminders.all({
            user,
            perPage: perPage || 20,
            page,
            search,
            sortKey: sortKey || 'due_date',
            direction: direction || 'asc',
        });

        ctx.utils.html.applyHighlighting(remindersData, ['title', 'content'], search);

        return c.render('reminders/reminders-index.html', {
            user,
            title: 'Reminders',
            path: '/reminders',
            layout: '_layouts/auth.html',
            reminders: remindersData,
            pagination,
            search,
            sortKey,
            direction,
        });
    }

    router.post(
        '/reminders',
        ctx.middleware.authentication,
        zValidator('form', reminderFormSchema, (result) => {
            if (!result.success) {
                const errors: Record<string, string> = {};
                for (const issue of result.error.issues) {
                    errors[String(issue.path[0] ?? 'general')] ??= issue.message;
                }
                throw new ctx.errors.ValidationError(errors);
            }
        }),
        async (c) => {
            const { title, content, when, custom_date, custom_time } = c.req.valid('form');
            const user = c.get('user') as User;

            const trimmedContent = content ? content.trim() : null;

            const timeInput = when === 'custom' ? (custom_date ?? '') : when;
            const timeToUse =
                when === 'custom' && custom_time
                    ? custom_time
                    : user.column_preferences?.reminders?.default_reminder_time;
            const timing = ctx.utils.search.parseReminderTiming(
                timeInput.toLowerCase(),
                timeToUse,
                user.timezone,
            );
            if (!timing.isValid) {
                throw new ctx.errors.ValidationError({
                    when: 'Invalid time format. Use: tomorrow, friday, weekly, monthly, daily, etc.',
                });
            }

            if (timing.type === 'once' && !timing.nextDue) {
                throw new ctx.errors.ValidationError({
                    when: 'One-time reminders must have a specific date. Please select a date.',
                });
            }

            await ctx.models.reminders.create({
                user_id: user.id,
                title: title.trim(),
                content: trimmedContent,
                reminder_type: timing.type,
                frequency: timing.frequency,
                due_date:
                    timing.nextDue instanceof Date ? timing.nextDue.toISOString() : timing.nextDue,
            });

            setFlash(c, 'success', 'Reminder created successfully');
            return c.redirect('/reminders');
        },
    );

    router.post(
        '/reminders/:id/update',
        ctx.middleware.authentication,
        zValidator('form', reminderFormSchema, (result) => {
            if (!result.success) {
                const errors: Record<string, string> = {};
                for (const issue of result.error.issues) {
                    errors[String(issue.path[0] ?? 'general')] ??= issue.message;
                }
                throw new ctx.errors.ValidationError(errors);
            }
        }),
        async (c) => {
            const user = c.get('user') as User;
            const reminderId = parseInt(c.req.param('id') ?? '', 10);
            const { title, content, when, custom_date, custom_time } = c.req.valid('form');

            const trimmedContent = content ? content.trim() : null;

            const timeInput = when === 'custom' ? (custom_date ?? '') : when;
            const timeToUse =
                when === 'custom' && custom_time
                    ? custom_time
                    : user.column_preferences?.reminders?.default_reminder_time;
            const timing = ctx.utils.search.parseReminderTiming(
                timeInput.toLowerCase(),
                timeToUse,
                user.timezone,
            );
            if (!timing.isValid) {
                throw new ctx.errors.ValidationError({
                    when: 'Invalid time format. Use: tomorrow, friday, weekly, monthly, daily, etc.',
                });
            }

            if (timing.type === 'once' && !timing.nextDue) {
                throw new ctx.errors.ValidationError({
                    when: 'One-time reminders must have a specific date. Please select a date.',
                });
            }

            const updatedReminder = await ctx.models.reminders.update(reminderId, user.id, {
                title,
                content: trimmedContent,
                reminder_type: timing.type,
                frequency: timing.frequency,
                due_date:
                    timing.nextDue instanceof Date ? timing.nextDue.toISOString() : timing.nextDue,
            });

            if (!updatedReminder) {
                throw new ctx.errors.NotFoundError('Reminder not found');
            }

            setFlash(c, 'success', 'Reminder updated successfully');
            return c.redirect('/reminders');
        },
    );

    router.post('/reminders/:id/delete', ctx.middleware.authentication, deleteReminderHandler);
    router.post('/reminders/delete', ctx.middleware.authentication, deleteReminderHandler);
    async function deleteReminderHandler(c: HonoContext) {
        const user = c.get('user') as User;
        const reminderIds = ctx.utils.request.extractIdsForDeleteFromContext(c);
        const deletedCount = await ctx.models.reminders.delete(reminderIds, user.id);

        if (!deletedCount) {
            throw new ctx.errors.NotFoundError('Reminder not found');
        }

        setFlash(
            c,
            'success',
            `${deletedCount} reminder${deletedCount !== 1 ? 's' : ''} deleted successfully`,
        );
        return c.redirect('/reminders');
    }

    const activePrefetches = new Set<number>();

    router.post('/reminders/prefetch', ctx.middleware.authentication, async (c) => {
        const user = c.get('user') as User;

        if (activePrefetches.has(user.id)) {
            setFlash(c, 'info', 'Screenshot caching already in progress...');
            return c.redirect('/reminders');
        }

        const reminders = await ctx
            .db('reminders')
            .select('title', 'content')
            .where({ user_id: user.id })
            .limit(500);

        const urls: string[] = [];
        for (const r of reminders) {
            if (r.title && ctx.utils.validation.isUrlLike(r.title)) {
                urls.push(r.title.startsWith('http') ? r.title : 'https://' + r.title);
            }
            if (r.content && ctx.utils.validation.isUrlLike(r.content)) {
                urls.push(r.content.startsWith('http') ? r.content : 'https://' + r.content);
            }
        }

        if (urls.length === 0) {
            setFlash(c, 'info', 'No URLs to cache');
            return c.redirect('/reminders');
        }

        activePrefetches.add(user.id);

        void ctx.utils.util
            .prefetchScreenshots(urls)
            .finally(() => activePrefetches.delete(user.id));

        setFlash(c, 'success', `Caching ${urls.length} preview images in background...`);
        return c.redirect('/reminders');
    });

    return router;
}
