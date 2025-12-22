import type { Request, Response } from 'express';
import type { User, AppContext } from '../../type';

export function ActionsRouter(ctx: AppContext) {
    const router = ctx.libs.express.Router();

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
    router.get('/api/actions', ctx.middleware.authentication, getActionsHandler);
    router.get('/actions', ctx.middleware.authentication, getActionsHandler);
    async function getActionsHandler(req: Request, res: Response) {
        const user = req.user as User;
        const { perPage, page, search, sortKey, direction } =
            ctx.utils.request.extractPaginationParams(req, 'actions');

        const { canViewHidden, hasVerifiedPassword } = ctx.utils.request.canViewHiddenItems(
            req,
            user,
        );

        const { data, pagination } = await ctx.models.actions.all({
            user,
            perPage,
            page,
            search,
            sortKey,
            direction,
            excludeHidden: !canViewHidden,
        });

        ctx.utils.html.applyHighlighting(data, ['name', 'trigger', 'url'], search);

        if (ctx.utils.request.isApiRequest(req)) {
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
            showHidden: canViewHidden,
            hiddenItemsVerified: hasVerifiedPassword,
        });
    }

    router.get(
        '/actions/create',
        ctx.middleware.authentication,
        async (_req: Request, res: Response) => {
            return res.render('actions/actions-create.html', {
                title: 'Actions / New',
                path: '/actions/create',
                layout: '_layouts/auth.html',
                actionTypes: ctx.utils.util.ACTION_TYPES,
            });
        },
    );

    router.get(
        '/actions/:id/edit',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const action = await ctx.db
                .select('bangs.*')
                .from('bangs')
                .where({
                    'bangs.id': req.params.id,
                    'bangs.user_id': (req.user as User).id,
                })
                .first();

            if (!action) {
                throw new ctx.errors.NotFoundError('Action not found');
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
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const id = parseInt(req.params.id as unknown as string);
            const action = await ctx
                .db('bangs')
                .where({
                    id,
                    user_id: req.session.user?.id,
                })
                .first();

            if (!action) {
                throw new ctx.errors.NotFoundError('Actions not found');
            }

            const tabs = await ctx.db('tabs').where({ user_id: req.session.user?.id });

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
    router.post('/api/actions', ctx.middleware.authentication, postActionHandler);
    router.post('/actions', ctx.middleware.authentication, postActionHandler);
    async function postActionHandler(req: Request, res: Response) {
        const { url, name, actionType, trigger, hidden } = req.body;
        const user = req.user as User;

        if (!url) {
            throw new ctx.errors.ValidationError({ url: 'URL is required' });
        }

        if (!name) {
            throw new ctx.errors.ValidationError({ name: 'Name is required' });
        }

        if (!actionType) {
            throw new ctx.errors.ValidationError({ actionType: 'Action type is required' });
        }

        if (!trigger) {
            throw new ctx.errors.ValidationError({ trigger: 'Trigger is required' });
        }

        if (!ctx.utils.validation.isValidUrl(url)) {
            throw new ctx.errors.ValidationError({ url: 'Invalid URL format' });
        }

        if (hidden !== undefined && typeof hidden !== 'boolean' && hidden !== 'on') {
            throw new ctx.errors.ValidationError({
                hidden: 'Hidden must be a boolean or checkbox value',
            });
        }

        if ((hidden === 'on' || hidden === true) && actionType !== 'redirect') {
            throw new ctx.errors.ValidationError({
                hidden: 'Only redirect-type actions can be hidden',
            });
        }

        if (hidden === 'on' || hidden === true) {
            const dbUser = await ctx.db('users').where({ id: user.id }).first();
            if (!dbUser?.hidden_items_password) {
                throw new ctx.errors.ValidationError({
                    hidden: 'You must set a global password in settings before hiding items',
                });
            }
        }

        const formattedTrigger: string = ctx.utils.util.normalizeBangTrigger(trigger);

        if (!ctx.utils.validation.isOnlyLettersAndNumbers(formattedTrigger.slice(1))) {
            throw new ctx.errors.ValidationError({
                trigger: 'Trigger can only contain letters and numbers',
            });
        }

        const existingBang = await ctx
            .db('bangs')
            .where({
                trigger: formattedTrigger,
                user_id: user.id,
            })
            .first();

        if (existingBang) {
            throw new ctx.errors.ValidationError({ trigger: 'This trigger already exists' });
        }

        await ctx.models.actions.create({
            name: name.trim(),
            trigger: formattedTrigger.toLowerCase(),
            url,
            action_type: actionType,
            actionType: actionType,
            user_id: user.id,
            hidden: hidden === 'on' || hidden === true,
        });

        ctx.utils.search.invalidateTriggerCache(req);

        if (ctx.utils.request.isApiRequest(req)) {
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
    router.patch('/api/actions/:id', ctx.middleware.authentication, updateActionHandler);
    router.post('/actions/:id/update', ctx.middleware.authentication, updateActionHandler);
    async function updateActionHandler(req: Request, res: Response) {
        const { url, name, actionType, trigger, hidden } = req.body;
        const user = req.user as User;
        const actionId = req.params.id as unknown as number;

        if (!url) {
            throw new ctx.errors.ValidationError({ url: 'URL is required' });
        }

        if (!name) {
            throw new ctx.errors.ValidationError({ name: 'Name is required' });
        }

        if (!actionType) {
            throw new ctx.errors.ValidationError({ actionType: 'Action type is required' });
        }

        if (!trigger) {
            throw new ctx.errors.ValidationError({ trigger: 'Trigger is required' });
        }

        if (!ctx.utils.validation.isValidUrl(url)) {
            throw new ctx.errors.ValidationError({ url: 'Invalid URL format' });
        }

        if (hidden !== undefined && typeof hidden !== 'boolean' && hidden !== 'on') {
            throw new ctx.errors.ValidationError({
                hidden: 'Hidden must be a boolean or checkbox value',
            });
        }

        if ((hidden === 'on' || hidden === true) && actionType !== 'redirect') {
            throw new ctx.errors.ValidationError({
                hidden: 'Only redirect-type actions can be hidden',
            });
        }

        if (hidden === 'on' || hidden === true) {
            const dbUser = await ctx.db('users').where({ id: user.id }).first();
            if (!dbUser?.hidden_items_password) {
                throw new ctx.errors.ValidationError({
                    hidden: 'You must set a global password in settings before hiding items',
                });
            }
        }

        if (!ctx.utils.validation.isOnlyLettersAndNumbers(trigger.slice(1))) {
            throw new ctx.errors.ValidationError({
                trigger: 'Trigger can only contain letters and numbers',
            });
        }

        const formattedTrigger = ctx.utils.util.normalizeBangTrigger(trigger);

        const existingBang = await ctx
            .db('bangs')
            .where({
                trigger: formattedTrigger,
                user_id: user.id,
            })
            .whereNot('id', req.params?.id)
            .first();

        if (existingBang) {
            throw new ctx.errors.ValidationError({ trigger: 'This trigger already exists' });
        }

        const currentAction = await ctx.models.actions.read(actionId, user.id);

        if (!currentAction) {
            throw new ctx.errors.NotFoundError('Action not found');
        }

        const updatedAction = await ctx.models.actions.update(actionId, user.id, {
            trigger: formattedTrigger,
            name: name.trim(),
            url,
            action_type: actionType,
            actionType: actionType,
            hidden: hidden === 'on' || hidden === true,
        });

        if (currentAction.trigger !== formattedTrigger) {
            ctx.utils.search.invalidateTriggerCache(req);
        }

        if (ctx.utils.request.isApiRequest(req)) {
            res.status(200).json({
                message: `Action ${updatedAction.trigger} updated successfully!`,
            });
            return;
        }

        req.flash('success', `Action ${updatedAction.trigger} updated successfully!`);

        if (updatedAction.hidden && !currentAction.hidden) {
            req.flash('success', 'Action hidden successfully');
            return res.redirect('/actions');
        }

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
    router.delete('/api/actions/:id', ctx.middleware.authentication, deleteActionHandler);
    router.post('/api/actions/delete', ctx.middleware.authentication, deleteActionHandler);
    router.post('/actions/:id/delete', ctx.middleware.authentication, deleteActionHandler);
    router.post('/actions/delete', ctx.middleware.authentication, deleteActionHandler);
    async function deleteActionHandler(req: Request, res: Response) {
        const user = req.user as User;
        const actionIds = ctx.utils.request.extractIdsForDelete(req);
        const deletedCount = await ctx.models.actions.delete(actionIds, user.id);

        if (!deletedCount) {
            throw new ctx.errors.NotFoundError('Action not found');
        }

        ctx.utils.search.invalidateTriggerCache(req);

        if (ctx.utils.request.isApiRequest(req)) {
            res.status(200).json({
                message: `${deletedCount} action${deletedCount !== 1 ? 's' : ''} deleted successfully`,
                data: { deletedCount },
            });
            return;
        }

        req.flash(
            'success',
            `${deletedCount} action${deletedCount !== 1 ? 's' : ''} deleted successfully`,
        );
        return res.redirect('/actions');
    }

    /**
     * POST /api/actions/{id}/hide
     *
     * @tags Actions
     * @summary Toggle hidden status of an action
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
    router.post('/actions/:id/hide', ctx.middleware.authentication, toggleActionHideHandler);
    router.post('/api/actions/:id/hide', ctx.middleware.authentication, toggleActionHideHandler);
    async function toggleActionHideHandler(req: Request, res: Response) {
        const user = req.user as User;
        const actionId = parseInt(req.params.id as unknown as string);

        const dbUser = await ctx.db('users').where({ id: user.id }).first();
        if (!dbUser?.hidden_items_password) {
            throw new ctx.errors.ValidationError({
                hidden: 'You must set a global password in settings before hiding items',
            });
        }

        const currentAction = await ctx.models.actions.read(actionId, user.id);

        if (!currentAction) {
            throw new ctx.errors.NotFoundError('Action not found');
        }

        if (!currentAction.hidden && currentAction.action_type !== 'redirect') {
            throw new ctx.errors.ValidationError({
                hidden: 'Only redirect-type actions can be hidden',
            });
        }

        const updatedAction = await ctx.models.actions.update(actionId, user.id, {
            hidden: !currentAction.hidden,
            actionType: currentAction.action_type,
        });

        if (ctx.utils.request.isApiRequest(req)) {
            res.status(200).json({
                message: `Action ${updatedAction.hidden ? 'hidden' : 'unhidden'} successfully`,
                data: updatedAction,
            });
            return;
        }

        req.flash('success', `Action ${updatedAction.hidden ? 'hidden' : 'unhidden'} successfully`);
        const showHidden = req.body.showHidden === 'true';
        return res.redirect('/actions' + (showHidden ? '?hidden=true' : ''));
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
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const action = await ctx.models.actions.read(
                parseInt(req.params.id as unknown as string),
                user.id,
            );

            if (!action) {
                throw new ctx.errors.NotFoundError('Action not found');
            }

            res.status(200).json({
                message: 'action retrieved successfully',
                data: action,
            });
        },
    );

    router.post(
        '/actions/:id/tabs',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const tab_id = parseInt(req.body.tab_id as unknown as string);
            const id = parseInt(req.params.id as unknown as string);

            await ctx.utils.util.addToTabs(user.id, tab_id, 'bangs', id);

            if (ctx.utils.request.isApiRequest(req)) {
                res.status(201).json({ message: 'Tab added successfully' });
                return;
            }

            req.flash('success', 'Tab added!');
            return res.redirect('/actions');
        },
    );

    const activePrefetches = new Set<number>();

    router.post(
        '/actions/prefetch',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.user as User;

            if (activePrefetches.has(user.id)) {
                req.flash('info', 'Screenshot caching already in progress...');
                return res.redirect('/actions');
            }

            const actions = await ctx
                .db('bangs')
                .select('url')
                .where({ user_id: user.id })
                .whereNotNull('url')
                .limit(500);

            const urls = actions.map((a: { url: string }) => a.url).filter(Boolean);

            if (urls.length === 0) {
                req.flash('info', 'No URLs to cache');
                return res.redirect('/actions');
            }

            activePrefetches.add(user.id);

            (async () => {
                try {
                    const batchSize = 5;
                    for (let i = 0; i < urls.length; i += batchSize) {
                        const batch = urls.slice(i, i + batchSize);
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
                                                'User-Agent': 'Bang/1.0 (https://bang.jaw.dev)',
                                            },
                                            signal: controller.signal,
                                        },
                                    );
                                    await response.text().catch(() => {});
                                } catch {
                                    // Ignore errors
                                } finally {
                                    clearTimeout(timeout);
                                }
                            }),
                        );
                    }
                } finally {
                    activePrefetches.delete(user.id);
                }
            })();

            req.flash('success', `Caching ${urls.length} preview images in background...`);
            return res.redirect('/actions');
        },
    );

    return router;
}
