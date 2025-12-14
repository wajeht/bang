import type { Request, Response } from 'express';
import type { User, AppContext } from '../../type';

export function RemindersRouter(ctx: AppContext) {
    const router = ctx.libs.express.Router();

    /**
     * A reminder
     * @typedef {object} Reminder
     * @property {string} id - reminder id
     * @property {string} title.required - reminder title
     * @property {string} content - reminder content
     * @property {string} reminder_type.required - reminder type
     * @property {string} frequency - reminder frequency
     * @property {string} due_date - reminder due date
     * @property {string} created_at - creation timestamp
     * @property {string} updated_at - last update timestamp
     */

    router.get(
        '/reminders/create',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            return res.render('reminders/reminders-create.html', {
                title: 'Reminders / New',
                path: '/reminders/create',
                layout: '_layouts/auth.html',
                user: req.session?.user,
                timingOptions: ctx.utils.search.reminderTimingConfig.getAllOptions(),
            });
        },
    );

    router.get(
        '/reminders/:id/edit',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const reminderId = parseInt(req.params.id || '', 10);

            const reminder = await ctx.models.reminders.read(reminderId, user.id);

            if (!reminder) {
                throw new ctx.errors.NotFoundError('Reminder not found');
            }

            return res.render('reminders/reminders-edit.html', {
                title: 'Reminders / Edit',
                path: `/reminders/${reminderId}/edit`,
                layout: '_layouts/auth.html',
                user: req.session?.user,
                reminder,
                timingOptions: ctx.utils.search.reminderTimingConfig.getAllOptions(),
            });
        },
    );

    router.get(
        '/reminders/:id/bookmarks/create',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.session.user as User;
            const reminderId = parseInt(req.params.id || '', 10);

            const reminder = await ctx.models.reminders.read(reminderId, user.id);

            if (!reminder) {
                throw new ctx.errors.NotFoundError('Reminder not found');
            }

            return res.render('reminders/reminders-id-bookmarks-create.html', {
                title: `Reminders / ${reminderId} / Bookmarks / Create`,
                path: `/reminders/${reminderId}/bookmarks/create`,
                layout: '_layouts/auth.html',
                user: req.session?.user,
                reminder,
            });
        },
    );

    router.post(
        '/reminders/:id/bookmarks',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.session.user as User;
            const reminderId = parseInt(req.params.id || '', 10);
            const { url, title, pinned, delete_reminder } = req.body;

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

            const existingBookmark = await ctx.utils.util.checkDuplicateBookmarkUrl(user.id, url);

            if (existingBookmark) {
                throw new ctx.errors.ValidationError({
                    url: `URL already bookmarked as "${existingBookmark.title}". Please use a different URL or update the existing bookmark.`,
                });
            }

            setTimeout(
                () =>
                    ctx.utils.util.insertBookmark({
                        url,
                        userId: user.id,
                        title,
                        pinned: pinned === 'on' || pinned === true,
                        req,
                    }),
                0,
            );

            // Delete reminder if requested
            if (delete_reminder === 'on' || delete_reminder === true) {
                await ctx.models.reminders.delete([reminderId], user.id);
            }

            const successMessage =
                delete_reminder === 'on' || delete_reminder === true
                    ? `Bookmark ${title} created successfully and reminder deleted!`
                    : `Bookmark ${title} created successfully!`;

            if (ctx.utils.request.isApiRequest(req)) {
                res.status(201).json({ message: successMessage });
                return;
            }

            req.flash('success', successMessage);
            return res.redirect('/reminders');
        },
    );

    router.post(
        '/reminders/recalculate',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.user as User;

            try {
                const recurringReminders = await ctx
                    .db('reminders')
                    .where({
                        user_id: user.id,
                        reminder_type: 'recurring',
                    })
                    .whereNotNull('frequency');

                for (const reminder of recurringReminders) {
                    const timing = ctx.utils.search.parseReminderTiming(
                        reminder.frequency.toLowerCase(),
                        user.column_preferences?.reminders?.default_reminder_time,
                        user.timezone,
                    );

                    if (timing.isValid && timing.nextDue) {
                        await ctx
                            .db('reminders')
                            .where({ id: reminder.id })
                            .update({
                                due_date:
                                    timing.nextDue instanceof Date
                                        ? timing.nextDue.toISOString()
                                        : timing.nextDue,
                                updated_at: ctx.db.fn.now(),
                            });
                    }
                }

                req.flash('success', `Recalculated ${recurringReminders.length} reminders`);
            } catch (error) {
                req.flash('error', 'Failed to recalculate reminders');
            }

            return res.redirect('/reminders');
        },
    );

    /**
     * GET /api/reminders
     *
     * @tags Reminders
     * @summary Get all reminders
     *
     * @security BearerAuth
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     */
    router.get('/api/reminders', ctx.middleware.authentication, getRemindersHandler);
    router.get('/reminders', ctx.middleware.authentication, getRemindersHandler);
    async function getRemindersHandler(req: Request, res: Response) {
        const user = req.user as User;
        const { perPage, page, search, sortKey, direction } =
            ctx.utils.request.extractPaginationParams(req, 'reminders');

        const { data: remindersData, pagination } = await ctx.models.reminders.all({
            user,
            perPage: perPage || 20,
            page,
            search,
            sortKey: sortKey || 'due_date',
            direction: direction || 'asc',
            highlight: !!search,
        });

        if (ctx.utils.request.isApiRequest(req)) {
            res.json({ data: remindersData, pagination, search, sortKey, direction });
            return;
        }

        return res.render('reminders/reminders-get.html', {
            user: req.user,
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

    /**
     * GET /api/reminders/{id}
     *
     * @tags Reminders
     * @summary Get a specific reminder
     *
     * @security BearerAuth
     *
     * @param {string} id.path.required - reminder id
     *
     * @return {Reminder} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.get(
        '/api/reminders/:id',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const reminder = await ctx.models.reminders.read(
                parseInt(req.params.id as unknown as string),
                user.id,
            );

            if (!reminder) {
                throw new ctx.errors.NotFoundError('Reminder not found');
            }

            res.status(200).json({
                message: 'Reminder retrieved successfully',
                data: reminder,
            });
            return;
        },
    );

    /**
     * POST /api/reminders
     *
     * @tags Reminders
     * @summary Create a new reminder
     *
     * @security BearerAuth
     *
     * @param {Reminder} request.body.required - reminder info
     *
     * @return {object} 201 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     *
     */
    router.post('/api/reminders', ctx.middleware.authentication, postReminderHandler);
    router.post('/reminders', ctx.middleware.authentication, postReminderHandler);
    async function postReminderHandler(req: Request, res: Response) {
        const { title, content, when, custom_date, custom_time } = req.body;
        const user = req.user as User;

        if (!title) {
            throw new ctx.errors.ValidationError({ title: 'Title is required' });
        }

        const trimmedContent = content ? content.trim() : null;

        if (!when) {
            throw new ctx.errors.ValidationError({ when: 'When is required' });
        }

        if (custom_time) {
            const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(custom_time)) {
                throw new ctx.errors.ValidationError({
                    custom_time: 'Invalid time format. Must be HH:MM (24-hour format)',
                });
            }
        }

        const timeInput = when === 'custom' ? custom_date : when;
        const timeToUse =
            when === 'custom' && custom_time
                ? custom_time
                : req.user?.column_preferences?.reminders?.default_reminder_time;
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

        const reminder = await ctx.models.reminders.create({
            user_id: user.id,
            title: title.trim(),
            content: trimmedContent,
            reminder_type: timing.type,
            frequency: timing.frequency,
            due_date:
                timing.nextDue instanceof Date ? timing.nextDue.toISOString() : timing.nextDue,
        });

        if (ctx.utils.request.isApiRequest(req)) {
            res.status(201).json({
                message: 'Reminder created successfully',
                data: reminder,
            });
            return;
        }

        req.flash('success', 'Reminder created successfully');
        return res.redirect('/reminders');
    }

    /**
     * PATCH /api/reminders/{id}
     *
     * @tags Reminders
     * @summary Update a reminder
     *
     * @security BearerAuth
     *
     * @param {string} id.path.required - reminder id
     * @param {Reminder} request.body.required - reminder info
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.patch('/api/reminders/:id', ctx.middleware.authentication, updateReminderHandler);
    router.post('/reminders/:id/update', ctx.middleware.authentication, updateReminderHandler);
    async function updateReminderHandler(req: Request, res: Response) {
        const user = req.user as User;
        const reminderId = parseInt(req.params.id as string);
        const { title, content, when, custom_date, custom_time } = req.body;

        if (!title) {
            throw new ctx.errors.ValidationError({ title: 'Title is required' });
        }

        const trimmedContent = content ? content.trim() : null;

        if (!when) {
            throw new ctx.errors.ValidationError({ when: 'When is required' });
        }

        if (custom_time) {
            const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(custom_time)) {
                throw new ctx.errors.ValidationError({
                    custom_time: 'Invalid time format. Must be HH:MM (24-hour format)',
                });
            }
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

        if (ctx.utils.request.isApiRequest(req)) {
            res.status(200).json({
                message: 'Reminder updated successfully',
                data: updatedReminder,
            });
            return;
        }

        req.flash('success', 'Reminder updated successfully');
        return res.redirect('/reminders');
    }

    /**
     * DELETE /api/reminders/{id}
     *
     * @tags Reminders
     * @summary Delete a reminder
     *
     * @security BearerAuth
     *
     * @param {string} id.path.required - reminder id
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.delete('/api/reminders/:id', ctx.middleware.authentication, deleteReminderHandler);
    router.post('/api/reminders/delete', ctx.middleware.authentication, deleteReminderHandler);
    router.post('/reminders/:id/delete', ctx.middleware.authentication, deleteReminderHandler);
    router.post('/reminders/delete', ctx.middleware.authentication, deleteReminderHandler);
    async function deleteReminderHandler(req: Request, res: Response) {
        const user = req.user as User;
        const reminderIds = ctx.utils.request.extractIdsForDelete(req);
        const deletedCount = await ctx.models.reminders.delete(reminderIds, user.id);

        if (!deletedCount) {
            throw new ctx.errors.NotFoundError('Reminder not found');
        }

        if (ctx.utils.request.isApiRequest(req)) {
            res.status(200).json({
                message: `${deletedCount} reminder${deletedCount !== 1 ? 's' : ''} deleted successfully`,
                data: { deletedCount },
            });
            return;
        }

        req.flash(
            'success',
            `${deletedCount} reminder${deletedCount !== 1 ? 's' : ''} deleted successfully`,
        );
        return res.redirect('/reminders');
    }

    router.post(
        '/reminders/prefetch',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const reminders = await ctx
                .db('reminders')
                .select('title', 'content')
                .where({ user_id: user.id });

            const urls: string[] = [];
            for (const r of reminders) {
                if (r.title && ctx.utils.validation.isUrlLike(r.title)) {
                    urls.push(r.title.startsWith('http') ? r.title : 'https://' + r.title);
                }
                if (r.content && ctx.utils.validation.isUrlLike(r.content)) {
                    urls.push(r.content.startsWith('http') ? r.content : 'https://' + r.content);
                }
            }

            setTimeout(() => {
                Promise.all(
                    urls.map((url) =>
                        fetch(`https://screenshot.jaw.dev?url=${encodeURIComponent(url)}`, {
                            method: 'HEAD',
                            headers: { 'User-Agent': 'Bang/1.0 (https://bang.jaw.dev)' },
                        }).catch(() => {}),
                    ),
                );
            }, 0);

            req.flash('success', `Caching ${urls.length} preview images in background...`);
            return res.redirect('/reminders');
        },
    );

    return router;
}
