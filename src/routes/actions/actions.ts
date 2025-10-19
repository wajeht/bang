import type { Request, Response } from 'express';
import type { User, AppContext } from '../../type';

export function ActionsRouter(ctx: AppContext) {
    const router = ctx.libs.express.Router();

    /**
     * @openapi
     * /api/actions:
     *   get:
     *     tags:
     *       - Actions
     *     summary: Get all actions
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: query
     *         name: page
     *         schema:
     *           type: integer
     *         description: Page number
     *       - in: query
     *         name: perPage
     *         schema:
     *           type: integer
     *         description: Items per page
     *       - in: query
     *         name: search
     *         schema:
     *           type: string
     *         description: Search query
     *       - in: query
     *         name: sortKey
     *         schema:
     *           type: string
     *         description: Sort by field
     *       - in: query
     *         name: direction
     *         schema:
     *           type: string
     *           enum: [asc, desc]
     *         description: Sort direction
     *       - in: query
     *         name: hidden
     *         schema:
     *           type: boolean
     *         description: Include hidden items
     *     responses:
     *       200:
     *         description: Success response
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 data:
     *                   type: array
     *                   items:
     *                     type: object
     *                 pagination:
     *                   type: object
     *       400:
     *         description: Bad request response
     */
    router.get('/api/actions', ctx.middleware.authentication, getActionsHandler);
    router.get('/actions', ctx.middleware.authentication, getActionsHandler);
    async function getActionsHandler(req: Request, res: Response) {
        const user = req.user as User;
        const { perPage, page, search, sortKey, direction } =
            ctx.utils.request.extractPaginationParams(req, 'actions');

        // Check if user wants to show hidden items and has verified password
        const showHidden = req.query.hidden === 'true';
        const hasVerifiedPassword =
            req.session?.hiddenItemsVerified &&
            req.session?.hiddenItemsVerifiedAt &&
            Date.now() - req.session.hiddenItemsVerifiedAt < 30 * 60 * 1000; // 30 minutes

        const canViewHidden = showHidden && hasVerifiedPassword && user.hidden_items_password;

        const { data, pagination } = await ctx.models.actions.all({
            user,
            perPage,
            page,
            search,
            sortKey,
            direction,
            highlight: !ctx.utils.auth.isApiRequest(req),
            excludeHidden: !canViewHidden,
        });

        if (ctx.utils.auth.isApiRequest(req)) {
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
     * @openapi
     * /api/actions:
     *   post:
     *     tags:
     *       - Actions
     *     summary: Create an action
     *     security:
     *       - BearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - name
     *               - trigger
     *               - url
     *               - action_type
     *             properties:
     *               name:
     *                 type: string
     *               trigger:
     *                 type: string
     *               url:
     *                 type: string
     *               action_type:
     *                 type: string
     *                 enum: [redirect, search, tab]
     *               description:
     *                 type: string
     *               hidden:
     *                 type: boolean
     *     responses:
     *       201:
     *         description: Created successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *                 data:
     *                   type: object
     *       400:
     *         description: Bad request response
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
            if (!user.hidden_items_password) {
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

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(201).json({
                message: `Action ${formattedTrigger} created successfully!`,
            });
            return;
        }

        req.flash('success', `Action ${formattedTrigger} created successfully!`);
        return res.redirect('/actions');
    }

    /**
     * @openapi
     * /api/actions/{id}:
     *   patch:
     *     tags:
     *       - Actions
     *     summary: Update an action
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *         description: Action ID
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - name
     *               - trigger
     *               - url
     *               - action_type
     *             properties:
     *               name:
     *                 type: string
     *               trigger:
     *                 type: string
     *               url:
     *                 type: string
     *               action_type:
     *                 type: string
     *                 enum: [redirect, search, tab]
     *               description:
     *                 type: string
     *               hidden:
     *                 type: boolean
     *     responses:
     *       200:
     *         description: Updated successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *                 data:
     *                   type: object
     *       400:
     *         description: Bad request response
     *       404:
     *         description: Not found response
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
            if (!user.hidden_items_password) {
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

        if (ctx.utils.auth.isApiRequest(req)) {
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
     * @openapi
     * /api/actions/{id}:
     *   delete:
     *     tags:
     *       - Actions
     *     summary: Delete an action
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *         description: Action ID
     *     responses:
     *       200:
     *         description: Deleted successfully
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *       404:
     *         description: Not found response
     */
    router.delete('/api/actions/:id', ctx.middleware.authentication, deleteActionHandler);
    router.post('/actions/:id/delete', ctx.middleware.authentication, deleteActionHandler);
    async function deleteActionHandler(req: Request, res: Response) {
        const deleted = await ctx.models.actions.delete(
            [req.params.id as unknown as number],
            (req.user as User).id,
        );

        if (!deleted) {
            throw new ctx.errors.NotFoundError('Action not found');
        }

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(200).json({ message: 'Action deleted successfully' });
            return;
        }

        req.flash('success', 'Action deleted successfully');
        return res.redirect('/actions');
    }

    /**
     * @openapi
     * /api/actions/delete-bulk:
     *   post:
     *     tags:
     *       - Actions
     *     summary: Delete multiple actions
     *     security:
     *       - BearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - id
     *             properties:
     *               id:
     *                 type: array
     *                 items:
     *                   type: integer
     *                 description: Array of action IDs to delete
     *     responses:
     *       200:
     *         description: Success response
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *                 data:
     *                   type: object
     *                   properties:
     *                     deletedCount:
     *                       type: integer
     *       400:
     *         description: Bad request response
     */
    router.post('/actions/delete-bulk', ctx.middleware.authentication, bulkDeleteActionHandler);
    router.post('/api/actions/delete-bulk', ctx.middleware.authentication, bulkDeleteActionHandler);
    async function bulkDeleteActionHandler(req: Request, res: Response) {
        const { id } = req.body;

        if (!id || !Array.isArray(id)) {
            throw new ctx.errors.ValidationError({ id: 'IDs array is required' });
        }

        const actionIds = id.map((id: string) => parseInt(id)).filter((id: number) => !isNaN(id));

        if (actionIds.length === 0) {
            throw new ctx.errors.ValidationError({ id: 'No valid action IDs provided' });
        }

        const user = req.user as User;
        const deletedCount = await ctx.models.actions.delete(actionIds, user.id);

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(200).json({
                message: `${deletedCount} action${deletedCount !== 1 ? 's' : ''} deleted successfully`,
                data: {
                    deletedCount,
                },
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
     * @openapi
     * /api/actions/{id}:
     *   get:
     *     tags:
     *       - Actions
     *     summary: Get a specific action
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *         description: Action ID
     *     responses:
     *       200:
     *         description: Success response
     *         content:
     *           application/json:
     *             schema:
     *               type: object
     *               properties:
     *                 message:
     *                   type: string
     *                 data:
     *                   type: object
     *       400:
     *         description: Bad request response
     *       404:
     *         description: Not found response
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

            if (ctx.utils.auth.isApiRequest(req)) {
                res.status(201).json({ message: 'Tab added successfully' });
                return;
            }

            req.flash('success', 'Tab added!');
            return res.redirect('/actions');
        },
    );

    return router;
}
