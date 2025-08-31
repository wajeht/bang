import {
    addToTabs,
    isValidUrl,
    actionTypes,
    isApiRequest,
    extractPagination,
    normalizeBangTrigger,
    isOnlyLettersAndNumbers,
} from '../../utils/util';
import type { Knex } from 'knex';
import type { User, Actions } from '../../type';
import { NotFoundError, ValidationError } from '../../error';
import express, { type Request, type Response } from 'express';
import { authenticationMiddleware } from '../../routes/middleware';

export function createActionsRouter(db: Knex, actions: Actions) {
    const router = express.Router();

    /**
     * An action
     * @typedef {object} Action
     * @property {string} id - action id
     * @property {string} url.required - action url
     * @property {string} name.required - action name
     * @property {string} actionType.required - action type
     * @property {string} trigger.required - trigger condition
     * @property {string} created_at - creation timestamp
     * @property {string} updated_at - last update timestamp
     */

    /**
     *
     * GET /api/actions
     *
     * @tags Actions
     * @summary get actions
     *
     * @security BearerAuth
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     */
    router.get('/api/actions', authenticationMiddleware, getActionsHandler);
    router.get('/actions', authenticationMiddleware, getActionsHandler);
    async function getActionsHandler(req: Request, res: Response) {
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
            excludeHidden: true,
        });

        if (isApiRequest(req)) {
            res.json({ data, pagination, search, sortKey, direction });
            return;
        }

        return res.render('actions/actions-get.html', {
            user: req.session?.user,
            path: '/actions',
            title: 'Actions',
            layout: '_layouts/auth.html',
            data,
            pagination,
            search,
            sortKey,
            direction,
        });
    }

    router.get(
        '/actions/create',
        authenticationMiddleware,
        async (_req: Request, res: Response) => {
            return res.render('actions/actions-create.html', {
                title: 'Actions / New',
                path: '/actions/create',
                layout: '_layouts/auth.html',
                actionTypes,
            });
        },
    );

    router.get(
        '/actions/:id/edit',
        authenticationMiddleware,
        async (req: Request, res: Response) => {
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

            return res.render('actions/actions-edit.html', {
                title: 'Actions / Edit',
                path: '/actions/edit',
                layout: '_layouts/auth.html',
                action,
            });
        },
    );

    router.get(
        '/actions/:id/tabs/create',
        authenticationMiddleware,
        async (req: Request, res: Response) => {
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

            return res.render('actions/actions-id-tabs-create.html', {
                title: `Actions / ${id} / Tabs / Create`,
                path: `/actions/${id}/tabs/create`,
                layout: '_layouts/auth.html',
                action,
                tabs,
            });
        },
    );

    /**
     *
     * POST /api/actions
     *
     * @tags Actions
     * @summary create an action
     *
     * @security BearerAuth
     *
     * @param {Action} request.body.required - action info
     *
     * @return {object} 201 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     *
     */
    router.post('/api/actions', authenticationMiddleware, postActionHandler);
    router.post('/actions', authenticationMiddleware, postActionHandler);
    async function postActionHandler(req: Request, res: Response) {
        const { url, name, actionType, trigger, hidden } = req.body;
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

        if (hidden !== undefined && typeof hidden !== 'boolean' && hidden !== 'on') {
            throw new ValidationError({ hidden: 'Hidden must be a boolean or checkbox value' });
        }

        if ((hidden === 'on' || hidden === true) && actionType !== 'redirect') {
            throw new ValidationError({ hidden: 'Only redirect-type actions can be hidden' });
        }

        if (hidden === 'on' || hidden === true) {
            if (!user.hidden_items_password) {
                throw new ValidationError({
                    hidden: 'You must set a global password in settings before hiding items',
                });
            }
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
            hidden: hidden === 'on' || hidden === true,
        });

        if (isApiRequest(req)) {
            res.status(201).json({
                message: `Action ${formattedTrigger} created successfully!`,
            });
            return;
        }

        req.flash('success', `Action ${formattedTrigger} created successfully!`);
        return res.redirect('/actions');
    }

    /**
     *
     * PATCH /api/actions/{id}
     *
     * @tags Actions
     * @summary update an action
     *
     * @security BearerAuth
     *
     * @param {string} id.path.required - action id
     * @param {Action} request.body.required - action info
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.patch('/api/actions/:id', authenticationMiddleware, updateActionHandler);
    router.post('/actions/:id/update', authenticationMiddleware, updateActionHandler);
    async function updateActionHandler(req: Request, res: Response) {
        const { url, name, actionType, trigger, hidden } = req.body;
        const user = req.user as User;
        const actionId = req.params.id as unknown as number;

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

        if (hidden !== undefined && typeof hidden !== 'boolean' && hidden !== 'on') {
            throw new ValidationError({ hidden: 'Hidden must be a boolean or checkbox value' });
        }

        if ((hidden === 'on' || hidden === true) && actionType !== 'redirect') {
            throw new ValidationError({ hidden: 'Only redirect-type actions can be hidden' });
        }

        if (hidden === 'on' || hidden === true) {
            if (!user.hidden_items_password) {
                throw new ValidationError({
                    hidden: 'You must set a global password in settings before hiding items',
                });
            }
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

        const updatedAction = await actions.update(actionId, user.id, {
            trigger: formattedTrigger,
            name: name.trim(),
            url,
            action_type: actionType,
            actionType: actionType,
            hidden: hidden === 'on' || hidden === true,
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

    /**
     *
     * DELETE /api/actions/{id}
     *
     * @tags Actions
     * @summary delete an action
     *
     * @security BearerAuth
     *
     * @param {string} id.path.required - action id
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.delete('/api/actions/:id', authenticationMiddleware, deleteActionHandler);
    router.post('/actions/:id/delete', authenticationMiddleware, deleteActionHandler);
    async function deleteActionHandler(req: Request, res: Response) {
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

    /**
     *
     * GET /api/actions/{id}
     *
     * @tags Actions
     * @summary get a specific action
     *
     * @security BearerAuth
     *
     * @param {string} id.path.required - action id
     *
     * @return {Action} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.get(
        '/api/actions/:id',
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const action = await actions.read(
                parseInt(req.params.id as unknown as string),
                user.id,
            );

            if (!action) {
                throw new NotFoundError('Action not found');
            }

            res.status(200).json({
                message: 'action retrieved successfully',
                data: action,
            });
        },
    );

    router.post(
        '/actions/:id/tabs',
        authenticationMiddleware,
        async (req: Request, res: Response) => {
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
        },
    );

    return router;
}
