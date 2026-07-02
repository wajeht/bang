import type { AppContext, AppContextContext, AppEnv, User } from '../../type.js';
import { renderView, setFlash } from '../middleware.js';
import { Hono } from 'hono';

export function createRemindersRouter(ctx: AppContext) {
    const REGEX_TIME_FORMAT = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;

    const router = new Hono<AppEnv>();

    router.get('/reminders/create', ctx.middleware.authentication, async (c) => {
        return renderView(ctx, c, 'reminders/reminders-new.html', {
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

        return renderView(ctx, c, 'reminders/reminders-edit.html', {
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

        return renderView(ctx, c, 'reminders/reminders-bookmarks-new.html', {
            title: `Reminders / ${reminderId} / Bookmarks / Create`,
            path: `/reminders/${reminderId}/bookmarks/create`,
            layout: '_layouts/auth.html',
            user: c.get('user'),
            reminder,
        });
    });

    router.post('/reminders/:id/bookmarks', ctx.middleware.authentication, async (c) => {
        const user = c.get('user') as User;
        const reminderId = parseInt(c.req.param('id') ?? '', 10);
        const { url, title, pinned, delete_reminder } = c.get('body');

        const reminder = await ctx.models.reminders.read(reminderId, user.id);

        if (!reminder) {
            throw new ctx.errors.NotFoundError('Reminder not found');
        }

        if (!title) {
            throw new ctx.errors.ValidationError({ title: 'Title is required' });
        }

        if (!url) {
            throw new ctx.errors.ValidationError({ url: 'URL is required' });
        }

        if (!ctx.utils.validation.isValidUrl(url)) {
            throw new ctx.errors.ValidationError({ url: 'Invalid URL format' });
        }

        if (pinned !== undefined && typeof pinned !== 'boolean' && pinned !== 'on') {
            throw new ctx.errors.ValidationError({
                pinned: 'Pinned must be a boolean or checkbox value',
            });
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
    });

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
    async function getRemindersHandler(c: AppContextContext) {
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

        return renderView(ctx, c, 'reminders/reminders-index.html', {
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

    router.post('/reminders', ctx.middleware.authentication, postReminderHandler);
    async function postReminderHandler(c: AppContextContext) {
        const { title, content, when, custom_date, custom_time } = c.get('body');
        const user = c.get('user') as User;

        if (!title) {
            throw new ctx.errors.ValidationError({ title: 'Title is required' });
        }

        const trimmedContent = content ? content.trim() : null;

        if (!when) {
            throw new ctx.errors.ValidationError({ when: 'When is required' });
        }

        if (custom_time && !REGEX_TIME_FORMAT.test(custom_time)) {
            throw new ctx.errors.ValidationError({
                custom_time: 'Invalid time format. Must be HH:MM (24-hour format)',
            });
        }

        const timeInput = when === 'custom' ? custom_date : when;
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
    }

    router.post('/reminders/:id/update', ctx.middleware.authentication, updateReminderHandler);
    async function updateReminderHandler(c: AppContextContext) {
        const user = c.get('user') as User;
        const reminderId = parseInt(c.req.param('id') ?? '', 10);
        const { title, content, when, custom_date, custom_time } = c.get('body');

        if (!title) {
            throw new ctx.errors.ValidationError({ title: 'Title is required' });
        }

        const trimmedContent = content ? content.trim() : null;

        if (!when) {
            throw new ctx.errors.ValidationError({ when: 'When is required' });
        }

        if (custom_time && !REGEX_TIME_FORMAT.test(custom_time)) {
            throw new ctx.errors.ValidationError({
                custom_time: 'Invalid time format. Must be HH:MM (24-hour format)',
            });
        }

        const timeInput = when === 'custom' ? custom_date : when;
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
    }

    router.post('/reminders/:id/delete', ctx.middleware.authentication, deleteReminderHandler);
    router.post('/reminders/delete', ctx.middleware.authentication, deleteReminderHandler);
    async function deleteReminderHandler(c: AppContextContext) {
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
