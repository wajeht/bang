import {
    isValidUrl,
    isApiRequest,
    insertBookmark,
    extractPagination,
    checkDuplicateBookmarkUrl,
} from '../../utils/util';
import express from 'express';
import type { User } from '../../type';
import type { Request, Response } from 'express';
import type { AppContext } from '../../context';
import { authenticationMiddleware } from '../middleware';
import { NotFoundError, ValidationError } from '../../error';
import { parseReminderTiming, reminderTimingConfig } from '../../utils/search';

export function createRemindersRouter(context: AppContext) {
    const { db, models } = context;

    const router = express.Router();

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
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            return res.render('reminders/reminders-create.html', {
                title: 'Reminders / New',
                path: '/reminders/create',
                layout: '_layouts/auth.html',
                user: req.session?.user,
                timingOptions: reminderTimingConfig.getAllOptions(),
            });
        },
    );

    router.get(
        '/reminders/:id/edit',
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const reminderId = parseInt(req.params.id || '', 10);

            const reminder = await context.models.reminders.read(reminderId, user.id);

            if (!reminder) {
                throw new NotFoundError('Reminder not found');
            }

            return res.render('reminders/reminders-edit.html', {
                title: 'Reminders / Edit',
                path: `/reminders/${reminderId}/edit`,
                layout: '_layouts/auth.html',
                user: req.session?.user,
                reminder,
                timingOptions: reminderTimingConfig.getAllOptions(),
            });
        },
    );

    router.get(
        '/reminders/:id/bookmarks/create',
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            const user = req.session.user as User;
            const reminderId = parseInt(req.params.id || '', 10);

            const reminder = await context.models.reminders.read(reminderId, user.id);

            if (!reminder) {
                throw new NotFoundError('Reminder not found');
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
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            const user = req.session.user as User;
            const reminderId = parseInt(req.params.id || '', 10);
            const { url, title, pinned, delete_reminder } = req.body;

            const reminder = await context.models.reminders.read(reminderId, user.id);

            if (!reminder) {
                throw new NotFoundError('Reminder not found');
            }

            if (!title) {
                throw new ValidationError({ title: 'Title is required' });
            }

            if (!url) {
                throw new ValidationError({ url: 'URL is required' });
            }

            if (!isValidUrl(url)) {
                throw new ValidationError({ url: 'Invalid URL format' });
            }

            if (pinned !== undefined && typeof pinned !== 'boolean' && pinned !== 'on') {
                throw new ValidationError({ pinned: 'Pinned must be a boolean or checkbox value' });
            }

            const existingBookmark = await checkDuplicateBookmarkUrl(user.id, url);

            if (existingBookmark) {
                throw new ValidationError({
                    url: `URL already bookmarked as "${existingBookmark.title}". Please use a different URL or update the existing bookmark.`,
                });
            }

            setTimeout(
                () =>
                    insertBookmark({
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
                await context.models.reminders.delete(reminderId, user.id);
            }

            const successMessage =
                delete_reminder === 'on' || delete_reminder === true
                    ? `Bookmark ${title} created successfully and reminder deleted!`
                    : `Bookmark ${title} created successfully!`;

            if (isApiRequest(req)) {
                res.status(201).json({ message: successMessage });
                return;
            }

            req.flash('success', successMessage);
            return res.redirect('/reminders');
        },
    );

    router.post(
        '/reminders/recalculate',
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            const user = req.user as User;

            try {
                const recurringReminders = await context
                    .db('reminders')
                    .where({
                        user_id: user.id,
                        reminder_type: 'recurring',
                    })
                    .whereNotNull('frequency');

                for (const reminder of recurringReminders) {
                    const timing = parseReminderTiming(
                        reminder.frequency.toLowerCase(),
                        user.column_preferences?.reminders?.default_reminder_time,
                        user.timezone,
                    );

                    if (timing.isValid && timing.nextDue) {
                        await context
                            .db('reminders')
                            .where({ id: reminder.id })
                            .update({
                                due_date:
                                    timing.nextDue instanceof Date
                                        ? timing.nextDue.toISOString()
                                        : timing.nextDue,
                                updated_at: context.db.fn.now(),
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
    router.get('/api/reminders', authenticationMiddleware, getRemindersHandler);
    router.get('/reminders', authenticationMiddleware, getRemindersHandler);
    async function getRemindersHandler(req: Request, res: Response) {
        const user = req.user as User;
        const { perPage, page, search, sortKey, direction } = extractPagination(req, 'reminders');

        const { data: remindersData, pagination } = await context.models.reminders.all({
            user,
            perPage: perPage || 20,
            page,
            search,
            sortKey: sortKey || 'due_date',
            direction: direction || 'asc',
            highlight: !!search,
        });

        if (isApiRequest(req)) {
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
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const reminder = await context.models.reminders.read(
                parseInt(req.params.id as unknown as string),
                user.id,
            );

            if (!reminder) {
                throw new NotFoundError('Reminder not found');
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
    router.post('/api/reminders', authenticationMiddleware, postReminderHandler);
    router.post('/reminders', authenticationMiddleware, postReminderHandler);
    async function postReminderHandler(req: Request, res: Response) {
        const { title, content, when, custom_date, custom_time } = req.body;
        const user = req.user as User;

        if (!title) {
            throw new ValidationError({ title: 'Title is required' });
        }

        const trimmedContent = content ? content.trim() : null;

        if (!when) {
            throw new ValidationError({ when: 'When is required' });
        }

        if (custom_time) {
            const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(custom_time)) {
                throw new ValidationError({
                    custom_time: 'Invalid time format. Must be HH:MM (24-hour format)',
                });
            }
        }

        const timeInput = when === 'custom' ? custom_date : when;
        const timeToUse =
            when === 'custom' && custom_time
                ? custom_time
                : req.user?.column_preferences?.reminders?.default_reminder_time;
        const timing = parseReminderTiming(timeInput.toLowerCase(), timeToUse, user.timezone);
        if (!timing.isValid) {
            throw new ValidationError({
                when: 'Invalid time format. Use: tomorrow, friday, weekly, monthly, daily, etc.',
            });
        }

        if (timing.type === 'once' && !timing.nextDue) {
            throw new ValidationError({
                when: 'One-time reminders must have a specific date. Please select a date.',
            });
        }

        const reminder = await context.models.reminders.create({
            user_id: user.id,
            title: title.trim(),
            content: trimmedContent,
            reminder_type: timing.type,
            frequency: timing.frequency,
            due_date:
                timing.nextDue instanceof Date ? timing.nextDue.toISOString() : timing.nextDue,
        });

        if (isApiRequest(req)) {
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
    router.patch('/api/reminders/:id', authenticationMiddleware, updateReminderHandler);
    router.post('/reminders/:id/update', authenticationMiddleware, updateReminderHandler);
    async function updateReminderHandler(req: Request, res: Response) {
        const user = req.user as User;
        const reminderId = parseInt(req.params.id as string);
        const { title, content, when, custom_date, custom_time } = req.body;

        if (!title) {
            throw new ValidationError({ title: 'Title is required' });
        }

        const trimmedContent = content ? content.trim() : null;

        if (!when) {
            throw new ValidationError({ when: 'When is required' });
        }

        if (custom_time) {
            const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
            if (!timeRegex.test(custom_time)) {
                throw new ValidationError({
                    custom_time: 'Invalid time format. Must be HH:MM (24-hour format)',
                });
            }
        }

        const timeInput = when === 'custom' ? custom_date : when;
        const timeToUse =
            when === 'custom' && custom_time
                ? custom_time
                : user.column_preferences?.reminders?.default_reminder_time;
        const timing = parseReminderTiming(timeInput.toLowerCase(), timeToUse, user.timezone);
        if (!timing.isValid) {
            throw new ValidationError({
                when: 'Invalid time format. Use: tomorrow, friday, weekly, monthly, daily, etc.',
            });
        }

        if (timing.type === 'once' && !timing.nextDue) {
            throw new ValidationError({
                when: 'One-time reminders must have a specific date. Please select a date.',
            });
        }

        const updatedReminder = await context.models.reminders.update(reminderId, user.id, {
            title,
            content: trimmedContent,
            reminder_type: timing.type,
            frequency: timing.frequency,
            due_date:
                timing.nextDue instanceof Date ? timing.nextDue.toISOString() : timing.nextDue,
        });

        if (!updatedReminder) {
            throw new NotFoundError('Reminder not found');
        }

        if (isApiRequest(req)) {
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
    router.delete('/api/reminders/:id', authenticationMiddleware, deleteReminderHandler);
    router.post('/reminders/:id/delete', authenticationMiddleware, deleteReminderHandler);
    async function deleteReminderHandler(req: Request, res: Response) {
        const user = req.user as User;
        const reminderId = parseInt(req.params.id as string);

        const deleted = await context.models.reminders.delete(reminderId, user.id);

        if (!deleted) {
            throw new NotFoundError('Reminder not found');
        }

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'Reminder deleted successfully' });
            return;
        }

        req.flash('success', 'Reminder deleted successfully');
        return res.redirect('/reminders');
    }

    /**
     *
     * POST /reminders/delete-bulk
     *
     * @tags Reminders
     * @summary delete multiple reminders
     *
     * @security BearerAuth
     *
     * @param {array} id.form.required - array of reminder ids
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     *
     */
    router.post('/reminders/delete-bulk', authenticationMiddleware, bulkDeleteReminderHandler);
    router.post('/api/reminders/delete-bulk', authenticationMiddleware, bulkDeleteReminderHandler);
    async function bulkDeleteReminderHandler(req: Request, res: Response) {
        const { id } = req.body;

        if (!id || !Array.isArray(id)) {
            throw new ValidationError({ id: 'IDs array is required' });
        }

        const reminderIds = id.map((id: string) => parseInt(id)).filter((id: number) => !isNaN(id));

        if (reminderIds.length === 0) {
            throw new ValidationError({ id: 'No valid reminder IDs provided' });
        }

        const user = req.user as User;
        const deletedCount = await context.models.reminders.bulkDelete(reminderIds, user.id);

        if (isApiRequest(req)) {
            res.status(200).json({
                message: `${deletedCount} reminder${deletedCount !== 1 ? 's' : ''} deleted successfully`,
                data: {
                    deletedCount,
                },
            });
            return;
        }

        req.flash(
            'success',
            `${deletedCount} reminder${deletedCount !== 1 ? 's' : ''} deleted successfully`,
        );
        return res.redirect('/reminders');
    }

    return router;
}
