import express, { Request, Response } from 'express';
import { Knex } from 'knex';
import { Actions, User } from '../type';
import {
    isValidUrl,
    isApiRequest,
    extractPagination,
    normalizeBangTrigger,
    isOnlyLettersAndNumbers,
    getConvertedReadmeMDToHTML,
    addToTabs,
    actionTypes,
} from '../utils/util';
import { NotFoundError, ValidationError } from '../error';

export function createActions(actions: Actions, db: Knex) {
    const router = express.Router();

    router.get('/actions', async (req: Request, res: Response) => {
        const user = req.user as User;
        const { perPage, page, search, sortKey, direction } = extractPagination(req, 'actions');

        const { data, pagination } = await actions.all({
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

        return res.render('./actions/actions-get.html', {
            user: req.session?.user,
            path: '/actions',
            title: 'Actions',
            layout: '../layouts/auth.html',
            howToContent: await getConvertedReadmeMDToHTML(),
            data,
            pagination,
            search,
            sortKey,
            direction,
        });
    });

    router.get('/actions/create', (_req: Request, res: Response) => {
        return res.render('./actions/actions-create.html', {
            title: 'Actions / New',
            path: '/actions/create',
            layout: '../layouts/auth.html',
            actionTypes,
        });
    });

    router.get('/actions/:id', async (req: Request, res: Response) => {
        const user = req.user as User;
        const action = await actions.read(parseInt(req.params.id as unknown as string), user.id);

        if (!action) {
            throw new NotFoundError('Action not found');
        }

        if (isApiRequest(req)) {
            res.status(200).json({
                message: 'action retrieved successfully',
                data: action,
            });
            return;
        }

        throw new NotFoundError('Action page does not exist');
    });

    router.get('/actions/:id/edit', async (req: Request, res: Response) => {
        const action = await db
            .select('bangs.*')
            .from('bangs')
            .where({
                'bangs.id': req.params.id,
                'bangs.user_id': (req.user as User).id,
            })
            .first();

        if (!action) {
            throw new NotFoundError('Action not found');
        }

        return res.render('./actions/actions-edit.html', {
            title: 'Actions / Edit',
            path: '/actions/edit',
            layout: '../layouts/auth.html',
            action,
        });
    });

    router.get('/actions/:id/tabs/create', async (req: Request, res: Response) => {
        const id = parseInt(req.params.id as unknown as string);
        const action = await db('bangs')
            .where({
                id,
                user_id: req.session.user?.id,
            })
            .first();

        if (!action) {
            throw new NotFoundError('Actions not found');
        }

        const tabs = await db('tabs').where({ user_id: req.session.user?.id });

        return res.render('./actions/actions-id-tabs-create.html', {
            title: `Actions / ${id} / Tabs / Create`,
            path: `/actions/${id}/tabs/create`,
            layout: '../layouts/auth.html',
            action,
            tabs,
        });
    });

    router.post('/actions', async (req: Request, res: Response) => {
        const { url, name, actionType, trigger } = req.body;
        const user = req.user as User;

        if (!url) {
            throw new ValidationError({ url: 'URL is required' });
        }

        if (!name) {
            throw new ValidationError({ name: 'Name is required' });
        }

        if (!actionType) {
            throw new ValidationError({ actionType: 'Action type is required' });
        }

        if (!trigger) {
            throw new ValidationError({ trigger: 'Trigger is required' });
        }

        if (!isValidUrl(url)) {
            throw new ValidationError({ url: 'Invalid URL format' });
        }

        const formattedTrigger: string = normalizeBangTrigger(trigger);

        if (!isOnlyLettersAndNumbers(formattedTrigger.slice(1))) {
            throw new ValidationError({ trigger: 'Trigger can only contain letters and numbers' });
        }

        const existingBang = await db('bangs')
            .where({
                trigger: formattedTrigger,
                user_id: user.id,
            })
            .first();

        if (existingBang) {
            throw new ValidationError({ trigger: 'This trigger already exists' });
        }

        await actions.create({
            name: name.trim(),
            trigger: formattedTrigger.toLowerCase(),
            url,
            action_type: actionType,
            actionType: actionType,
            user_id: user.id,
        });

        if (isApiRequest(req)) {
            res.status(201).json({
                message: `Action ${formattedTrigger} created successfully!`,
            });
            return;
        }

        req.flash('success', `Action ${formattedTrigger} created successfully!`);
        return res.redirect('/actions');
    });

    router.post('/actions/:id/tabs', async (req: Request, res: Response) => {
        const user = req.user as User;
        const tab_id = parseInt(req.body.tab_id as unknown as string);
        const id = parseInt(req.params.id as unknown as string);

        await addToTabs(user.id, tab_id, 'bangs', id);

        if (isApiRequest(req)) {
            res.status(201).json({ message: 'Tab added successfully' });
            return;
        }

        req.flash('success', 'Tab added!');
        return res.redirect('/actions');
    });

    router.post('/actions/:id/update', updateHandler);
    router.patch('/actions/:id', updateHandler);
    async function updateHandler(req: Request, res: Response) {
        const { url, name, actionType, trigger } = req.body;
        const user = req.user as User;

        if (!url) {
            throw new ValidationError({ url: 'URL is required' });
        }

        if (!name) {
            throw new ValidationError({ name: 'Name is required' });
        }

        if (!actionType) {
            throw new ValidationError({ actionType: 'Action type is required' });
        }

        if (!trigger) {
            throw new ValidationError({ trigger: 'Trigger is required' });
        }

        if (!isValidUrl(url)) {
            throw new ValidationError({ url: 'Invalid URL format' });
        }

        if (!isOnlyLettersAndNumbers(trigger.slice(1))) {
            throw new ValidationError({ trigger: 'Trigger can only contain letters and numbers' });
        }

        const formattedTrigger = normalizeBangTrigger(trigger);

        const existingBang = await db('bangs')
            .where({
                trigger: formattedTrigger,
                user_id: user.id,
            })
            .whereNot('id', req.params?.id)
            .first();

        if (existingBang) {
            throw new ValidationError({ trigger: 'This trigger already exists' });
        }

        const updatedAction = await actions.update(req.params.id as unknown as number, user.id, {
            trigger: formattedTrigger,
            name: name.trim(),
            url,
            action_type: actionType,
            actionType: actionType,
        });

        if (isApiRequest(req)) {
            res.status(200).json({
                message: `Action ${updatedAction.trigger} updated successfully!`,
            });
            return;
        }

        req.flash('success', `Action ${updatedAction.trigger} updated successfully!`);
        return res.redirect('/actions');
    }

    router.post('/actions/:id/delete', deleteHandler);
    router.delete('/actions/:id', deleteHandler);
    async function deleteHandler(req: Request, res: Response) {
        const deleted = await actions.delete(
            req.params.id as unknown as number,
            (req.user as User).id,
        );

        if (!deleted) {
            throw new NotFoundError('Action not found');
        }

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'Action deleted successfully' });
            return;
        }

        req.flash('success', 'Action deleted successfully');
        return res.redirect('/actions');
    }

    return router;
}
