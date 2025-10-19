import type { Request, Response } from 'express';
import type { User, AppContext } from '../../type';

export function TabsRouter(ctx: AppContext) {
    const router = ctx.libs.express.Router();

    router.get(
        '/tabs/create',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            return res.render('tabs/tabs-create.html', {
                title: 'Tabs / Create',
                path: '/tabs/create',
                layout: '_layouts/auth.html',
                user: req.session.user,
            });
        },
    );

    router.post(
        '/tabs/delete-all',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.session.user as User;

            await ctx.db('tabs').where({ user_id: user.id }).delete();

            if (ctx.utils.auth.isApiRequest(req)) {
                res.status(200).json({ message: 'All tab groups deleted successfully' });
                return;
            }

            req.flash('success', 'All tab groups deleted!');
            return res.redirect('/tabs');
        },
    );

    router.get(
        '/tabs/:id/edit',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const tab = await ctx.models.tabs.read(parseInt(req.params.id as string), user.id);

            if (!tab) {
                throw new ctx.errors.NotFoundError('Tab group not found');
            }

            return res.render('tabs/tabs-edit.html', {
                title: 'Tabs / Edit',
                path: `/tabs/${req.params.id}/edit`,
                layout: '_layouts/auth.html',
                user: req.session.user,
                tab,
            });
        },
    );

    router.get(
        '/tabs/:id/launch',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.session.user as User;
            const id = req.params.id;

            const tabGroup = await ctx.models.tabs.read(parseInt(id as string), user.id);

            if (!tabGroup) {
                throw new ctx.errors.NotFoundError('Tab group not found');
            }

            return res.render('tabs/tabs-launch.html', {
                title: `Tabs Launch: ${tabGroup.title}`,
                path: `/tabs/${id}/launch`,
                layout: '_layouts/auth.html',
                tabGroup,
                tabs: tabGroup.items || [],
                user,
            });
        },
    );

    router.get(
        '/tabs/:id/items/create',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.session.user as User;
            const tabId = req.params.id;
            const tab = await ctx.db('tabs').where({ id: tabId, user_id: user.id }).first();

            if (!tab) {
                throw new ctx.errors.NotFoundError('Tab group not found');
            }

            return res.render('tabs/tabs-items-create.html', {
                title: 'Add Tab Item',
                path: `/tabs/${tabId}/items/create`,
                layout: '_layouts/auth.html',
                tab,
                user,
            });
        },
    );

    router.get(
        '/tabs/:id/items/:itemId/edit',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const { id, itemId } = req.params;

            const tab = await ctx.db
                .select('*')
                .from('tabs')
                .where({ id, user_id: user.id })
                .first();

            if (!tab) {
                throw new ctx.errors.NotFoundError('Tab group not found');
            }

            const tabItem = await ctx.db
                .select('*')
                .from('tab_items')
                .where({ id: itemId, tab_id: id })
                .first();

            if (!tabItem) {
                throw new ctx.errors.NotFoundError('Tab item not found');
            }

            return res.render('tabs/tabs-items-edit.html', {
                title: 'Edit Tab Item',
                path: `/tabs/${id}/items/${itemId}/edit`,
                layout: '_layouts/auth.html',
                tabItem,
                user,
            });
        },
    );

    /**
     * @openapi
     * /api/tabs:
     *   get:
     *     tags:
     *       - Tabs
     *     summary: Get all tabs
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: query
     *         name: page
     *         schema:
     *           type: integer
     *       - in: query
     *         name: perPage
     *         schema:
     *           type: integer
     *       - in: query
     *         name: search
     *         schema:
     *           type: string
     *       - in: query
     *         name: sortKey
     *         schema:
     *           type: string
     *       - in: query
     *         name: direction
     *         schema:
     *           type: string
     *           enum: [asc, desc]
     *     responses:
     *       200:
     *         description: Success response
     *       400:
     *         description: Bad request
     */
    router.get('/api/tabs', ctx.middleware.authentication, getTabsPageHandler);
    router.get('/tabs', ctx.middleware.authentication, getTabsPageHandler);
    async function getTabsPageHandler(req: Request, res: Response) {
        const user = req.user as User;
        const { perPage, page, search, sortKey, direction } =
            ctx.utils.request.extractPaginationParams(req, 'tabs');

        const { data: tabsData, pagination } = await ctx.models.tabs.all({
            user,
            perPage,
            page,
            search,
            sortKey,
            direction,
            highlight: !ctx.utils.auth.isApiRequest(req),
        });

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(200).json({
                message: 'Tabs retrieved successfully',
                data: tabsData,
                pagination,
                search,
                sortKey,
                direction,
            });
            return;
        }

        return res.render('tabs/tabs-get.html', {
            title: 'Tabs',
            path: '/tabs',
            layout: '_layouts/auth.html',
            tabs: tabsData,
            user,
            pagination,
            search,
            sortKey,
            direction,
        });
    }

    /**
     * @openapi
     * /api/tabs:
     *   post:
     *     tags:
     *       - Tabs
     *     summary: Create a tab
     *     security:
     *       - BearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - title
     *               - trigger
     *             properties:
     *               title:
     *                 type: string
     *               trigger:
     *                 type: string
     *     responses:
     *       200:
     *         description: Success response
     *       400:
     *         description: Bad request
     */
    router.post('/api/tabs', ctx.middleware.authentication, postTabsPageHandler);
    router.post('/tabs', ctx.middleware.authentication, postTabsPageHandler);
    async function postTabsPageHandler(req: Request, res: Response) {
        const user = req.user as User;
        const { title, trigger } = req.body;

        if (!title) {
            throw new ctx.errors.ValidationError({ title: 'Title is required' });
        }

        if (!trigger) {
            throw new ctx.errors.ValidationError({ trigger: 'Trigger is required' });
        }

        const formattedTrigger: string = ctx.utils.util.normalizeBangTrigger(trigger);

        if (!ctx.utils.validation.isOnlyLettersAndNumbers(formattedTrigger.slice(1))) {
            throw new ctx.errors.ValidationError({
                trigger: 'Trigger can only contain letters and numbers',
            });
        }

        const existingTab = await ctx
            .db('tabs')
            .where({
                trigger: formattedTrigger,
                user_id: user.id,
            })
            .first();

        const existingAction = await ctx.db.select('*').from('bangs').where({
            user_id: user.id,
            trigger: formattedTrigger,
        });

        if (existingAction.length) {
            throw new ctx.errors.ValidationError({
                trigger: 'This trigger already exists in Actions. Please choose another one!',
            });
        }

        if (existingTab) {
            throw new ctx.errors.ValidationError({ trigger: 'This trigger already exists' });
        }

        await ctx.models.tabs.create({
            user_id: user.id,
            title,
            trigger: formattedTrigger,
        });

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(201).json({ message: 'Tab group created successfully' });
            return;
        }

        req.flash('success', 'Tab group created!');
        return res.redirect('/tabs');
    }

    /**
     * @openapi
     * /api/tabs/{id}:
     *   patch:
     *     tags:
     *       - Tabs
     *     summary: Update a tab
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - title
     *               - trigger
     *             properties:
     *               title:
     *                 type: string
     *               trigger:
     *                 type: string
     *     responses:
     *       200:
     *         description: Updated successfully
     *       400:
     *         description: Bad request
     *       404:
     *         description: Not found
     */
    router.patch('/api/tabs/:id', ctx.middleware.authentication, updateTabHandler);
    router.post('/tabs/:id/update', ctx.middleware.authentication, updateTabHandler);
    async function updateTabHandler(req: Request, res: Response) {
        const user = req.user as User;
        const { title, trigger } = req.body;

        const tab = await ctx.models.tabs.read(parseInt(req.params.id as string), user.id);

        if (!tab) {
            throw new ctx.errors.NotFoundError('Tab group not found');
        }

        if (!title) {
            throw new ctx.errors.ValidationError({ title: 'Title is required' });
        }

        if (!trigger) {
            throw new ctx.errors.ValidationError({ trigger: 'Trigger is required' });
        }

        const formattedTrigger: string = ctx.utils.util.normalizeBangTrigger(trigger);

        if (!ctx.utils.validation.isOnlyLettersAndNumbers(formattedTrigger.slice(1))) {
            throw new ctx.errors.ValidationError({
                trigger: 'Trigger can only contain letters and numbers',
            });
        }

        const existingAction = await ctx.db.select('*').from('bangs').where({
            user_id: user.id,
            trigger: formattedTrigger,
        });

        if (existingAction.length) {
            throw new ctx.errors.ValidationError({
                trigger: 'This trigger already exists in Actions. Please choose another one!',
            });
        }

        const existingTab = await ctx
            .db('tabs')
            .where({
                trigger: formattedTrigger,
                user_id: user.id,
            })
            .whereNot({ id: tab.id })
            .first();

        if (existingTab) {
            throw new ctx.errors.ValidationError({ trigger: 'This trigger already exists' });
        }

        await ctx.models.tabs.update(parseInt(req.params.id as string), user.id, {
            title,
            trigger: formattedTrigger,
        });

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(200).json({ message: 'Tab group updated successfully' });
            return;
        }

        req.flash('success', 'Tab group updated!');
        return res.redirect('/tabs');
    }

    /**
     * @openapi
     * /api/tabs/{id}:
     *   delete:
     *     tags:
     *       - Tabs
     *     summary: Delete a tab
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     responses:
     *       200:
     *         description: Deleted successfully
     *       404:
     *         description: Not found
     */
    router.delete('/api/tabs/:id', ctx.middleware.authentication, deleteTabHandler);
    router.post('/tabs/:id/delete', ctx.middleware.authentication, deleteTabHandler);
    async function deleteTabHandler(req: Request, res: Response) {
        const user = req.user as User;
        const tabId = parseInt(req.params.id as unknown as string);

        const deleted = await ctx.models.tabs.delete([tabId], user.id);

        if (!deleted) {
            throw new ctx.errors.NotFoundError('Tab group not found');
        }

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(200).json({ message: 'Tab group deleted successfully' });
            return;
        }

        req.flash('success', 'Tab group deleted!');
        return res.redirect('/tabs');
    }

    /**
     * @openapi
     * /api/tabs/delete-bulk:
     *   post:
     *     tags:
     *       - Tabs
     *     summary: Delete multiple tabs
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
     *     responses:
     *       200:
     *         description: Success response
     *       400:
     *         description: Bad request
     */
    router.post('/api/tabs/delete-bulk', ctx.middleware.authentication, bulkDeleteTabHandler);
    router.post('/tabs/delete-bulk', ctx.middleware.authentication, bulkDeleteTabHandler);
    async function bulkDeleteTabHandler(req: Request, res: Response) {
        const { id } = req.body;

        if (!id || !Array.isArray(id)) {
            throw new ctx.errors.ValidationError({ id: 'IDs array is required' });
        }

        const tabIds = id.map((id: string) => parseInt(id)).filter((id: number) => !isNaN(id));

        if (tabIds.length === 0) {
            throw new ctx.errors.ValidationError({ id: 'No valid tab IDs provided' });
        }

        const user = req.user as User;
        const deletedCount = await ctx.models.tabs.delete(tabIds, user.id);

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(200).json({
                message: `${deletedCount} tab group${deletedCount !== 1 ? 's' : ''} deleted successfully`,
                data: {
                    deletedCount,
                },
            });
            return;
        }

        req.flash(
            'success',
            `${deletedCount} tab group${deletedCount !== 1 ? 's' : ''} deleted successfully`,
        );
        return res.redirect('/tabs');
    }

    /**
     *
     * A tab item
     * @typedef {object} TabItem
     * @property {string} id - tab item id
     * @property {string} tab_id - parent tab id
     * @property {string} title.required - tab item title
     * @property {string} url.required - tab item url
     * @property {string} created_at - creation timestamp
     * @property {string} updated_at - last update timestamp
     *
     */

    /**
     * @openapi
     * /api/tabs/{id}/items:
     *   post:
     *     tags:
     *       - Tab Items
     *     summary: Create a tab item
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *         description: Tab ID
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - title
     *               - url
     *             properties:
     *               title:
     *                 type: string
     *               url:
     *                 type: string
     *     responses:
     *       201:
     *         description: Created successfully
     *       400:
     *         description: Bad request
     */
    router.post('/api/tabs/:id/items', ctx.middleware.authentication, postTabItemCreateHandler);
    router.post('/tabs/:id/items/create', ctx.middleware.authentication, postTabItemCreateHandler);
    async function postTabItemCreateHandler(req: Request, res: Response) {
        const user = req.user as User;
        const tabId = req.params.id;
        const { title, url } = req.body;

        if (!title) {
            throw new ctx.errors.ValidationError({ title: 'Title is required' });
        }

        if (!url) {
            throw new ctx.errors.ValidationError({ url: 'URL is required' });
        }

        if (!ctx.utils.validation.isValidUrl(url)) {
            throw new ctx.errors.ValidationError({ url: 'Invalid URL format' });
        }

        const tab = await ctx.db('tabs').where({ id: tabId, user_id: user.id }).first();

        if (!tab) {
            throw new ctx.errors.NotFoundError('Tab group not found');
        }

        await ctx.db('tab_items').insert({
            tab_id: tab.id,
            title,
            url,
        });

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(201).json({ message: 'Tab item created successfully' });
            return;
        }

        req.flash('success', 'Tab item added!');
        return res.redirect('/tabs');
    }

    /**
     *
     * PATCH /api/tabs/{id}/items/{itemId}
     *
     * @tags Tab Items
     * @summary update a tab item
     *
     * @security BearerAuth
     *
     * @param {string} id.path.required - tab id
     * @param {string} itemId.path.required - tab item id
     * @param {TabItem} request.body.required - tab item info
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.patch(
        '/api/tabs/:id/items/:itemId',
        ctx.middleware.authentication,
        postTabItemUpdateHandler,
    );
    router.post(
        '/tabs/:id/items/:itemId/update',
        ctx.middleware.authentication,
        postTabItemUpdateHandler,
    );
    async function postTabItemUpdateHandler(req: Request, res: Response) {
        const user = req.user as User;
        const { id, itemId } = req.params;

        const tab = await ctx.db('tabs').where({ id, user_id: user.id }).first();

        if (!tab) {
            throw new ctx.errors.NotFoundError('Tab group not found');
        }

        const { title, url } = req.body;

        if (!title) {
            throw new ctx.errors.ValidationError({ title: 'Title is required' });
        }

        if (!url) {
            throw new ctx.errors.ValidationError({ url: 'URL is required' });
        }

        if (!ctx.utils.validation.isValidUrl(url)) {
            throw new ctx.errors.ValidationError({ url: 'Invalid URL format' });
        }

        const tabItem = await ctx.db('tab_items').where({ id: itemId, tab_id: id }).first();

        if (!tabItem) {
            throw new ctx.errors.NotFoundError('Tab item not found');
        }

        await ctx.db.transaction(async (trx) => {
            await trx('tab_items').where({ id: itemId, tab_id: id }).update({
                title,
                url,
                updated_at: ctx.db.fn.now(),
            });

            await trx('tabs').where({ id }).update({ updated_at: ctx.db.fn.now() });
        });

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(200).json({ message: 'Tab item updated successfully' });
            return;
        }

        req.flash('success', 'Tab item updated!');
        return res.redirect(`/tabs`);
    }

    /**
     *
     * DELETE /api/tabs/{id}/items/{itemId}
     *
     * @tags Tab Items
     * @summary delete a tab item
     *
     * @security BearerAuth
     *
     * @param {string} id.path.required - tab id
     * @param {string} itemId.path.required - tab item id
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.delete(
        '/api/tabs/:id/items/:itemId',
        ctx.middleware.authentication,
        deleteTabItemHandler,
    );
    router.post(
        '/tabs/:id/items/:itemId/delete',
        ctx.middleware.authentication,
        deleteTabItemHandler,
    );
    async function deleteTabItemHandler(req: Request, res: Response) {
        const user = req.user as User;
        const tabId = parseInt(req.params.id as unknown as string);
        const itemId = parseInt(req.params.itemId as unknown as string);

        await ctx.db.transaction(async (trx) => {
            await trx('tab_items').where({ id: itemId, tab_id: tabId }).delete();
            await trx('tabs')
                .where({ id: tabId, user_id: user.id })
                .update({ updated_at: ctx.db.fn.now() });
        });

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(200).json({ message: 'Tab item deleted successfully' });
            return;
        }

        req.flash('success', 'Tab item deleted!');
        return res.redirect(`/tabs`);
    }

    return router;
}
