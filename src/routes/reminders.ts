import express, { Request, Response } from 'express';
import { Reminders, User } from '../type';
import { isApiRequest, extractPagination, getConvertedReadmeMDToHTML } from '../utils/util';
import { parseReminderTiming, reminderTimingConfig } from '../utils/search';
import { NotFoundError, ValidationError } from '../error';

export function createReminders(reminders: Reminders) {
    const router = express.Router();

    router.get('/reminders', async (req: Request, res: Response) => {
        const user = req.user as User;
        const { perPage, page, search, sortKey, direction } = extractPagination(req, 'reminders');

        const { data, pagination } = await reminders.all({
            user,
            perPage,
            page,
            search,
            sortKey,
            direction,
            highlight: !isApiRequest(req),
        });

        if (isApiRequest(req)) {
            res.json({ data, pagination, search, sortKey, direction });
            return;
        }

        return res.render('./reminders/reminders-get.html', {
            user: req.session?.user,
            title: 'Reminders',
            path: '/reminders',
            layout: '../layouts/auth',
            howToContent: await getConvertedReadmeMDToHTML(),
            data,
            search,
            pagination,
            sortKey,
            direction,
        });
    });

    router.get('/reminders/create', (req: Request, res: Response) => {
        return res.render('./reminders/reminders-create.html', {
            title: 'Reminders / Create',
            path: '/reminders/create',
            layout: '../layouts/auth',
            reminderTimingConfig,
        });
    });

    router.get('/reminders/:id', async (req: Request, res: Response) => {
        const user = req.user as User;
        const reminder = await reminders.read(
            parseInt(req.params.id as unknown as string),
            user.id,
        );

        if (!reminder) {
            throw new NotFoundError('Reminder not found');
        }

        if (isApiRequest(req)) {
            res.status(200).json({
                message: 'Reminder retrieved successfully',
                data: reminder,
            });
            return;
        }

        throw new NotFoundError('Reminder page does not exist');
    });

    router.get('/reminders/:id/edit', async (req: Request, res: Response) => {
        const user = req.user as User;
        const reminder = await reminders.read(
            parseInt(req.params.id as unknown as string),
            user.id,
        );

        if (!reminder) {
            throw new NotFoundError('Reminder not found');
        }

        return res.render('./reminders/reminders-edit.html', {
            title: 'Reminders / Edit',
            path: '/reminders/edit',
            layout: '../layouts/auth',
            reminder,
            reminderTimingConfig,
        });
    });

    router.post('/reminders', async (req: Request, res: Response) => {
        const { title, content, reminder_type, timing, due_date } = req.body;
        const user = req.user as User;

        if (!title) {
            throw new ValidationError({ title: 'Title is required' });
        }

        if (!reminder_type) {
            throw new ValidationError({ reminder_type: 'Reminder type is required' });
        }

        if (!['one-time', 'recurring'].includes(reminder_type)) {
            throw new ValidationError({ reminder_type: 'Invalid reminder type' });
        }

        let parsedDueDate = null;
        let frequency = null;

        if (reminder_type === 'one-time') {
            if (!due_date) {
                throw new ValidationError({
                    due_date: 'Due date is required for one-time reminders',
                });
            }
            parsedDueDate = due_date;
        } else if (reminder_type === 'recurring') {
            if (!timing) {
                throw new ValidationError({ timing: 'Timing is required for recurring reminders' });
            }

            const parsed = parseReminderTiming(timing, user.timezone || 'UTC');
            if (!parsed) {
                throw new ValidationError({ timing: 'Invalid timing format' });
            }

            parsedDueDate = parsed.nextDue;
            frequency = parsed.frequency;
        }

        const reminder = await reminders.create({
            user_id: user.id,
            title: title.trim(),
            content: content?.trim() || '',
            reminder_type,
            frequency,
            due_date: parsedDueDate,
        });

        if (isApiRequest(req)) {
            res.status(201).json({
                message: `Reminder "${reminder.title}" created successfully!`,
                data: reminder,
            });
            return;
        }

        req.flash('success', `Reminder "${reminder.title}" created successfully!`);
        return res.redirect('/reminders');
    });

    router.post('/reminders/:id/update', updateHandler);
    router.patch('/reminders/:id', updateHandler);
    async function updateHandler(req: Request, res: Response) {
        const { title, content, reminder_type, timing, due_date } = req.body;
        const user = req.user as User;

        if (!title) {
            throw new ValidationError({ title: 'Title is required' });
        }

        if (!reminder_type) {
            throw new ValidationError({ reminder_type: 'Reminder type is required' });
        }

        if (!['one-time', 'recurring'].includes(reminder_type)) {
            throw new ValidationError({ reminder_type: 'Invalid reminder type' });
        }

        let parsedDueDate = null;
        let frequency = null;

        if (reminder_type === 'one-time') {
            if (!due_date) {
                throw new ValidationError({
                    due_date: 'Due date is required for one-time reminders',
                });
            }
            parsedDueDate = due_date;
        } else if (reminder_type === 'recurring') {
            if (!timing) {
                throw new ValidationError({ timing: 'Timing is required for recurring reminders' });
            }

            const parsed = parseReminderTiming(timing, user.timezone || 'UTC');
            if (!parsed) {
                throw new ValidationError({ timing: 'Invalid timing format' });
            }

            parsedDueDate = parsed.nextDue;
            frequency = parsed.frequency;
        }

        const updatedReminder = await reminders.update(
            parseInt(req.params.id as unknown as string),
            user.id,
            {
                title: title.trim(),
                content: content?.trim() || '',
                reminder_type,
                frequency,
                due_date: parsedDueDate,
            },
        );

        if (isApiRequest(req)) {
            res.status(200).json({
                message: `Reminder "${updatedReminder.title}" updated successfully!`,
                data: updatedReminder,
            });
            return;
        }

        req.flash('success', `Reminder "${updatedReminder.title}" updated successfully!`);
        return res.redirect('/reminders');
    }

    router.post('/:id/update', updateHandler);
    router.patch('/:id', updateHandler);

    router.post('/reminders/:id/delete', deleteHandler);
    router.delete('/reminders/:id', deleteHandler);
    async function deleteHandler(req: Request, res: Response) {
        const user = req.user as User;
        const deleted = await reminders.delete(
            parseInt(req.params.id as unknown as string),
            user.id,
        );

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

    return router;
}
