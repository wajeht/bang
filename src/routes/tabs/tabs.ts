import {
    isValidUrl,
    isApiRequest,
    extractPagination,
    normalizeBangTrigger,
    isOnlyLettersAndNumbers,
} from '../../utils/util';
import express from 'express';
import type { User } from '../../type';
import type { Request, Response } from 'express';
import type { AppContext } from '../../context';
import { authenticationMiddleware } from '../middleware';
import { NotFoundError, ValidationError } from '../../error';

export function createTabsRouter(context: AppContext) {
    const router = express.Router();

    /**
     *
     * A tab
     * @typedef {object} Tab
     * @property {string} id - tab id
     * @property {string} title.required - tab title
     * @property {string} trigger.required - tab trigger
     * @property {string} created_at - creation timestamp
     * @property {string} updated_at - last update timestamp
     *
     */

    router.get('/tabs/create', authenticationMiddleware, async (req: Request, res: Response) => {
        return res.render('tabs/tabs-create.html', {
            title: 'Tabs / Create',
            path: '/tabs/create',
            layout: '_layouts/auth.html',
            user: req.session.user,
        });
    });

    router.post(
        '/tabs/delete-all',
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            const user = req.session.user as User;

            await context.db('tabs').where({ user_id: user.id }).delete();

            if (isApiRequest(req)) {
                res.status(200).json({ message: 'All tab groups deleted successfully' });
                return;
            }

            req.flash('success', 'All tab groups deleted!');
            return res.redirect('/tabs');
        },
    );

    router.get('/tabs/:id/edit', authenticationMiddleware, async (req: Request, res: Response) => {
        const user = req.user as User;
        const tab = await context.models.tabs.read(parseInt(req.params.id as string), user.id);

        if (!tab) {
            throw new NotFoundError('Tab group not found');
        }

        return res.render('tabs/tabs-edit.html', {
            title: 'Tabs / Edit',
            path: `/tabs/${req.params.id}/edit`,
            layout: '_layouts/auth.html',
            user: req.session.user,
            tab,
        });
    });

    router.get(
        '/tabs/:id/launch',
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            const user = req.session.user as User;
            const id = req.params.id;

            const tabGroup = await context.models.tabs.read(parseInt(id as string), user.id);

            if (!tabGroup) {
                throw new NotFoundError('Tab group not found');
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
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            const user = req.session.user as User;
            const tabId = req.params.id;
            const tab = await context.db('tabs').where({ id: tabId, user_id: user.id }).first();

            if (!tab) {
                throw new NotFoundError('Tab group not found');
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
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const { id, itemId } = req.params;

            const tab = await context.db
                .select('*')
                .from('tabs')
                .where({ id, user_id: user.id })
                .first();

            if (!tab) {
                throw new NotFoundError('Tab group not found');
            }

            const tabItem = await context.db
                .select('*')
                .from('tab_items')
                .where({ id: itemId, tab_id: id })
                .first();

            if (!tabItem) {
                throw new NotFoundError('Tab item not found');
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
     *
     * GET /api/tabs
     *
     * @tags Tabs
     * @summary Get all tabs
     *
     * @security BearerAuth
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     *
     */
    router.get('/api/tabs', authenticationMiddleware, getTabsPageHandler);
    router.get('/tabs', authenticationMiddleware, getTabsPageHandler);
    async function getTabsPageHandler(req: Request, res: Response) {
        const user = req.user as User;
        const { perPage, page, search, sortKey, direction } = extractPagination(req, 'tabs');

        const { data: tabsData, pagination } = await context.models.tabs.all({
            user,
            perPage,
            page,
            search,
            sortKey,
            direction,
            highlight: !isApiRequest(req),
        });

        if (isApiRequest(req)) {
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
     *
     * POST /api/tabs
     *
     * @tags Tabs
     * @summary create a tab
     *
     * @security BearerAuth
     *
     * @param {string} request.title.required - tab title
     * @param {string} request.trigger.required - tab trigger
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     *
     */
    router.post('/api/tabs', authenticationMiddleware, postTabsPageHandler);
    router.post('/tabs', authenticationMiddleware, postTabsPageHandler);
    async function postTabsPageHandler(req: Request, res: Response) {
        const user = req.user as User;
        const { title, trigger } = req.body;

        if (!title) {
            throw new ValidationError({ title: 'Title is required' });
        }

        if (!trigger) {
            throw new ValidationError({ trigger: 'Trigger is required' });
        }

        const formattedTrigger: string = normalizeBangTrigger(trigger);

        if (!isOnlyLettersAndNumbers(formattedTrigger.slice(1))) {
            throw new ValidationError({ trigger: 'Trigger can only contain letters and numbers' });
        }

        const existingTab = await context
            .db('tabs')
            .where({
                trigger: formattedTrigger,
                user_id: user.id,
            })
            .first();

        const existingAction = await context.db.select('*').from('bangs').where({
            user_id: user.id,
            trigger: formattedTrigger,
        });

        if (existingAction.length) {
            throw new ValidationError({
                trigger: 'This trigger already exists in Actions. Please choose another one!',
            });
        }

        if (existingTab) {
            throw new ValidationError({ trigger: 'This trigger already exists' });
        }

        await context.models.tabs.create({
            user_id: user.id,
            title,
            trigger: formattedTrigger,
        });

        if (isApiRequest(req)) {
            res.status(201).json({ message: 'Tab group created successfully' });
            return;
        }

        req.flash('success', 'Tab group created!');
        return res.redirect('/tabs');
    }

    /**
     *
     * PATCH /api/tabs/{id}
     *
     * @tags Tabs
     * @summary update a tab
     *
     * @security BearerAuth
     *
     * @param {string} id.path.required - tab id
     * @param {string} request.title.required - tab title
     * @param {string} request.trigger.required - tab trigger
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.patch('/api/tabs/:id', authenticationMiddleware, updateTabHandler);
    router.post('/tabs/:id/update', authenticationMiddleware, updateTabHandler);
    async function updateTabHandler(req: Request, res: Response) {
        const user = req.user as User;
        const { title, trigger } = req.body;

        const tab = await context.models.tabs.read(parseInt(req.params.id as string), user.id);

        if (!tab) {
            throw new NotFoundError('Tab group not found');
        }

        if (!title) {
            throw new ValidationError({ title: 'Title is required' });
        }

        if (!trigger) {
            throw new ValidationError({ trigger: 'Trigger is required' });
        }

        const formattedTrigger: string = normalizeBangTrigger(trigger);

        if (!isOnlyLettersAndNumbers(formattedTrigger.slice(1))) {
            throw new ValidationError({ trigger: 'Trigger can only contain letters and numbers' });
        }

        const existingAction = await context.db.select('*').from('bangs').where({
            user_id: user.id,
            trigger: formattedTrigger,
        });

        if (existingAction.length) {
            throw new ValidationError({
                trigger: 'This trigger already exists in Actions. Please choose another one!',
            });
        }

        const existingTab = await context
            .db('tabs')
            .where({
                trigger: formattedTrigger,
                user_id: user.id,
            })
            .whereNot({ id: tab.id })
            .first();

        if (existingTab) {
            throw new ValidationError({ trigger: 'This trigger already exists' });
        }

        await context.models.tabs.update(parseInt(req.params.id as string), user.id, {
            title,
            trigger: formattedTrigger,
        });

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'Tab group updated successfully' });
            return;
        }

        req.flash('success', 'Tab group updated!');
        return res.redirect('/tabs');
    }

    /**
     *
     * DELETE /api/tabs/{id}
     *
     * @tags Tabs
     * @summary delete a tab
     *
     * @security BearerAuth
     *
     * @param {string} id.path.required - tab id
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.delete('/api/tabs/:id', authenticationMiddleware, deleteTabHandler);
    router.post('/tabs/:id/delete', authenticationMiddleware, deleteTabHandler);
    async function deleteTabHandler(req: Request, res: Response) {
        const user = req.user as User;
        const tabId = parseInt(req.params.id as unknown as string);

        const deleted = await context.models.tabs.delete(tabId, user.id);

        if (!deleted) {
            throw new NotFoundError('Tab group not found');
        }

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'Tab group deleted successfully' });
            return;
        }

        req.flash('success', 'Tab group deleted!');
        return res.redirect('/tabs');
    }

    /**
     *
     * POST /api/tabs/delete-bulk
     *
     * @tags Tabs
     * @summary Delete multiple tabs
     *
     * @security BearerAuth
     *
     * @param {object} request.body.required - Bulk delete request
     * @param {array<string>} request.body.id - Array of tab IDs
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     *
     */
    router.post('/api/tabs/delete-bulk', authenticationMiddleware, bulkDeleteTabHandler);
    router.post('/tabs/delete-bulk', authenticationMiddleware, bulkDeleteTabHandler);
    async function bulkDeleteTabHandler(req: Request, res: Response) {
        const { id } = req.body;

        if (!id || !Array.isArray(id)) {
            throw new ValidationError({ id: 'IDs array is required' });
        }

        const tabIds = id.map((id: string) => parseInt(id)).filter((id: number) => !isNaN(id));

        if (tabIds.length === 0) {
            throw new ValidationError({ id: 'No valid tab IDs provided' });
        }

        const user = req.user as User;
        const deletedCount = await context.models.tabs.bulkDelete(tabIds, user.id);

        if (isApiRequest(req)) {
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
     *
     * POST /api/tabs/{id}/items
     *
     * @tags Tab Items
     * @summary create a tab item
     *
     * @security BearerAuth
     *
     * @param {string} id.path.required - tab id
     * @param {TabItem} request.body.required - tab item info
     *
     * @return {object} 201 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     *
     */
    router.post('/api/tabs/:id/items', authenticationMiddleware, postTabItemCreateHandler);
    router.post('/tabs/:id/items/create', authenticationMiddleware, postTabItemCreateHandler);
    async function postTabItemCreateHandler(req: Request, res: Response) {
        const user = req.user as User;
        const tabId = req.params.id;
        const { title, url } = req.body;

        if (!title) {
            throw new ValidationError({ title: 'Title is required' });
        }

        if (!url) {
            throw new ValidationError({ url: 'URL is required' });
        }

        if (!isValidUrl(url)) {
            throw new ValidationError({ url: 'Invalid URL format' });
        }

        const tab = await context.db('tabs').where({ id: tabId, user_id: user.id }).first();

        if (!tab) {
            throw new NotFoundError('Tab group not found');
        }

        await context.db('tab_items').insert({
            tab_id: tab.id,
            title,
            url,
        });

        if (isApiRequest(req)) {
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
    router.patch('/api/tabs/:id/items/:itemId', authenticationMiddleware, postTabItemUpdateHandler);
    router.post(
        '/tabs/:id/items/:itemId/update',
        authenticationMiddleware,
        postTabItemUpdateHandler,
    );
    async function postTabItemUpdateHandler(req: Request, res: Response) {
        const user = req.user as User;
        const { id, itemId } = req.params;

        const tab = await context.db('tabs').where({ id, user_id: user.id }).first();

        if (!tab) {
            throw new NotFoundError('Tab group not found');
        }

        const { title, url } = req.body;

        if (!title) {
            throw new ValidationError({ title: 'Title is required' });
        }

        if (!url) {
            throw new ValidationError({ url: 'URL is required' });
        }

        if (!isValidUrl(url)) {
            throw new ValidationError({ url: 'Invalid URL format' });
        }

        const tabItem = await context.db('tab_items').where({ id: itemId, tab_id: id }).first();

        if (!tabItem) {
            throw new NotFoundError('Tab item not found');
        }

        await context.db.transaction(async (trx) => {
            await trx('tab_items').where({ id: itemId, tab_id: id }).update({
                title,
                url,
                updated_at: context.db.fn.now(),
            });

            await trx('tabs').where({ id }).update({ updated_at: context.db.fn.now() });
        });

        if (isApiRequest(req)) {
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
    router.delete('/api/tabs/:id/items/:itemId', authenticationMiddleware, deleteTabItemHandler);
    router.post('/tabs/:id/items/:itemId/delete', authenticationMiddleware, deleteTabItemHandler);
    async function deleteTabItemHandler(req: Request, res: Response) {
        const user = req.user as User;
        const tabId = parseInt(req.params.id as unknown as string);
        const itemId = parseInt(req.params.itemId as unknown as string);

        await context.db.transaction(async (trx) => {
            await trx('tab_items').where({ id: itemId, tab_id: tabId }).delete();
            await trx('tabs')
                .where({ id: tabId, user_id: user.id })
                .update({ updated_at: context.db.fn.now() });
        });

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'Tab item deleted successfully' });
            return;
        }

        req.flash('success', 'Tab item deleted!');
        return res.redirect(`/tabs`);
    }

    return router;
}
