import express, { Request, Response } from 'express';
import { Knex } from 'knex';
import { Tabs, User } from '../type';
import {
    isApiRequest,
    extractPagination,
    normalizeBangTrigger,
    isOnlyLettersAndNumbers,
    isValidUrl,
} from '../utils/util';
import { NotFoundError, ValidationError } from '../error';

export function createTabs(tabs: Tabs, db: Knex) {
    const router = express.Router();

    router.get('/tabs', async (req: Request, res: Response) => {
        const user = req.user as User;
        const { perPage, page, search, sortKey, direction } = extractPagination(req, 'tabs');

        const { data: tabsData, pagination } = await tabs.all({
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

        return res.render('./tabs/tabs-get.html', {
            user: req.session?.user,
            title: 'Tabs',
            path: '/tabs',
            layout: '../layouts/auth.html',
            data: tabsData,
            pagination,
            search,
            sortKey,
            direction,
        });
    });

    router.get('/tabs/create', (_req: Request, res: Response) => {
        return res.render('./tabs/tabs-create.html', {
            title: 'Tabs / Create',
            path: '/tabs/create',
            layout: '../layouts/auth.html',
        });
    });

    router.get('/tabs/:id/launch', async (req: Request, res: Response) => {
        const user = req.user as User;
        const id = req.params.id;

        const tabGroup = await tabs.read(parseInt(id as string), user.id);

        if (!tabGroup) {
            throw new NotFoundError('Tab group not found');
        }

        return res.render('tabs/tabs-launch.html', {
            title: `Tabs Launch: ${tabGroup.title}`,
            path: `/tabs/${id}/launch`,
            layout: '../layouts/auth.html',
            tabGroup,
            tabs: tabGroup.items || [],
            user,
        });
    });

    router.get('/tabs/:id/edit', async (req: Request, res: Response) => {
        const user = req.user as User;
        const id = parseInt(req.params.id as string);

        const tab = await tabs.read(id, user.id);

        if (!tab) {
            throw new NotFoundError('Tab not found');
        }

        return res.render('./tabs/tabs-edit.html', {
            title: 'Tabs / Edit',
            path: '/tabs/edit',
            layout: '../layouts/auth.html',
            tab,
        });
    });

    router.get('/tabs/:id/items/create', async (req: Request, res: Response) => {
        const userId = req.session.user?.id;
        const tabId = parseInt(req.params.id as string);

        const tab = await db('tabs').where({ id: tabId, user_id: userId }).first();

        if (!tab) {
            throw new NotFoundError('Tab not found');
        }

        return res.render('./tabs/tab-items-create.html', {
            title: `Tabs / ${tabId} / Items / Create`,
            path: `/tabs/${tabId}/items/create`,
            layout: '../layouts/auth.html',
            tab,
        });
    });

    router.get('/tabs/:id/items/:itemId/edit', async (req: Request, res: Response) => {
        const userId = req.session.user?.id;
        const tabId = parseInt(req.params.id as string);
        const itemId = parseInt(req.params.itemId as string);

        const tabItem = await db('tab_items')
            .leftJoin('tabs', 'tab_items.tab_id', 'tabs.id')
            .where({
                'tab_items.id': itemId,
                'tab_items.tab_id': tabId,
                'tabs.user_id': userId,
            })
            .select('tab_items.*', 'tabs.title as tab_title')
            .first();

        if (!tabItem) {
            throw new NotFoundError('Tab item not found');
        }

        return res.render('./tabs/tab-items-edit.html', {
            title: `Tabs / ${tabId} / Items / ${itemId} / Edit`,
            path: `/tabs/${tabId}/items/${itemId}/edit`,
            layout: '../layouts/auth.html',
            tabItem,
            tabId,
        });
    });

    router.post('/tabs', async (req: Request, res: Response) => {
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

        const existingTab = await db('tabs')
            .where({
                trigger: formattedTrigger,
                user_id: user.id,
            })
            .first();

        if (existingTab) {
            throw new ValidationError({ trigger: 'This trigger already exists' });
        }

        const tab = await tabs.create({
            title: title.trim(),
            trigger: formattedTrigger.toLowerCase(),
            user_id: user.id,
        });

        if (isApiRequest(req)) {
            res.status(201).json({
                message: `Tab ${formattedTrigger} created successfully!`,
                data: tab,
            });
            return;
        }

        req.flash('success', `Tab ${formattedTrigger} created successfully!`);
        return res.redirect('/tabs');
    });

    router.post('/tabs/:id/update', updateHandler);
    router.patch('/tabs/:id', updateHandler);
    async function updateHandler(req: Request, res: Response) {
        const user = req.user as User;
        const id = parseInt(req.params.id as string);
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

        const existingTab = await db('tabs')
            .where({
                trigger: formattedTrigger,
                user_id: user.id,
            })
            .whereNot('id', id)
            .first();

        if (existingTab) {
            throw new ValidationError({ trigger: 'This trigger already exists' });
        }

        const updatedTab = await tabs.update(id, user.id, {
            title: title.trim(),
            trigger: formattedTrigger.toLowerCase(),
        });

        if (isApiRequest(req)) {
            res.status(200).json({
                message: `Tab ${updatedTab.trigger} updated successfully!`,
                data: updatedTab,
            });
            return;
        }

        req.flash('success', `Tab ${updatedTab.trigger} updated successfully!`);
        return res.redirect('/tabs');
    }

    router.post('/tabs/:id/delete', deleteHandler);
    router.delete('/tabs/:id', deleteHandler);
    async function deleteHandler(req: Request, res: Response) {
        const user = req.user as User;
        const id = parseInt(req.params.id as string);

        const deleted = await tabs.delete(id, user.id);

        if (!deleted) {
            throw new NotFoundError('Tab not found');
        }

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'Tab deleted successfully' });
            return;
        }

        req.flash('success', 'Tab deleted successfully');
        return res.redirect('/tabs');
    }

    router.post('/delete-all', async (req: Request, res: Response) => {
        const userId = req.session.user?.id;

        if (!userId) {
            throw new NotFoundError('User not found');
        }

        await db('tabs').where({ user_id: userId }).delete();

        req.flash('success', 'All tabs deleted successfully');
        return res.redirect('/tabs');
    });

    router.post('/tabs/:id/items/create', async (req: Request, res: Response) => {
        const userId = req.session.user?.id;
        const tabId = parseInt(req.params.id as string);
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

        const tab = await db('tabs').where({ id: tabId, user_id: userId }).first();

        if (!tab) {
            throw new NotFoundError('Tab not found');
        }

        await db('tab_items').insert({
            tab_id: tabId,
            title: title.trim(),
            url,
        });

        if (isApiRequest(req)) {
            res.status(201).json({ message: 'Tab item created successfully' });
            return;
        }

        req.flash('success', 'Tab item created successfully');
        return res.redirect(`/tabs/${tabId}/edit`);
    });

    router.post('/tabs/:id/items', async (req: Request, res: Response) => {
        const userId = req.session.user?.id;
        const tabId = parseInt(req.params.id as string);
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

        const tab = await db('tabs').where({ id: tabId, user_id: userId }).first();

        if (!tab) {
            throw new NotFoundError('Tab not found');
        }

        await db('tab_items').insert({
            tab_id: tabId,
            title: title.trim(),
            url,
        });

        res.status(201).json({ message: 'Tab item created successfully' });
    });

    router.post('/tabs/:id/items/:itemId/update', updateItemHandler);
    router.patch('/tabs/:id/items/:itemId', updateItemHandler);
    async function updateItemHandler(req: Request, res: Response) {
        const userId = req.session.user?.id;
        const tabId = parseInt(req.params.id as string);
        const itemId = parseInt(req.params.itemId as string);
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

        const tabItem = await db('tab_items')
            .leftJoin('tabs', 'tab_items.tab_id', 'tabs.id')
            .where({
                'tab_items.id': itemId,
                'tab_items.tab_id': tabId,
                'tabs.user_id': userId,
            })
            .first();

        if (!tabItem) {
            throw new NotFoundError('Tab item not found');
        }

        await db('tab_items').where({ id: itemId }).update({
            title: title.trim(),
            url,
        });

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'Tab item updated successfully' });
            return;
        }

        req.flash('success', 'Tab item updated successfully');
        return res.redirect(`/tabs/${tabId}/edit`);
    }

    router.post('/tabs/:id/items/:itemId/delete', deleteItemHandler);
    router.delete('/tabs/:id/items/:itemId', deleteItemHandler);
    async function deleteItemHandler(req: Request, res: Response) {
        const userId = req.session.user?.id;
        const tabId = parseInt(req.params.id as string);
        const itemId = parseInt(req.params.itemId as string);

        const tabItem = await db('tab_items')
            .leftJoin('tabs', 'tab_items.tab_id', 'tabs.id')
            .where({
                'tab_items.id': itemId,
                'tab_items.tab_id': tabId,
                'tabs.user_id': userId,
            })
            .first();

        if (!tabItem) {
            throw new NotFoundError('Tab item not found');
        }

        await db('tab_items').where({ id: itemId }).delete();

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'Tab item deleted successfully' });
            return;
        }

        req.flash('success', 'Tab item deleted successfully');
        return res.redirect(`/tabs/${tabId}/edit`);
    }

    return router;
}
