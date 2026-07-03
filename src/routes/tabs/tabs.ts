import type { AppContext, AppContextContext, AppEnv, User } from '../../type.js';
import { setFlash } from '../middleware.js';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

export function createTabsRouter(ctx: AppContext) {
    const router = new Hono<AppEnv>();

    const tabFormSchema = z.object({
        title: z.string('Title is required').min(1, 'Title is required'),
        trigger: z.string('Trigger is required').min(1, 'Trigger is required'),
    });

    const tabItemFormSchema = z.object({
        title: z.string('Title is required').min(1, 'Title is required'),
        url: z
            .string('URL is required')
            .min(1, 'URL is required')
            .refine((value) => ctx.utils.validation.isValidUrl(value), 'Invalid URL format'),
    });

    router.get('/tabs/create', ctx.middleware.authentication, async (c) => {
        return c.render('tabs/tabs-new.html', {
            title: 'Tabs / Create',
            path: '/tabs/create',
            layout: '_layouts/auth.html',
            user: c.get('user'),
        });
    });

    router.get('/tabs/:id/edit', ctx.middleware.authentication, async (c) => {
        const user = c.get('user') as User;
        const tab = await ctx.models.tabs.read(parseInt(c.req.param('id') ?? '', 10), user.id);

        if (!tab) {
            throw new ctx.errors.NotFoundError('Tab group not found');
        }

        return c.render('tabs/tabs-edit.html', {
            title: 'Tabs / Edit',
            path: `/tabs/${String(c.req.param('id'))}/edit`,
            layout: '_layouts/auth.html',
            user: c.get('user'),
            tab,
        });
    });

    router.get('/tabs/:id/launch', ctx.middleware.authentication, async (c) => {
        const user = c.get('user') as User;
        const id = c.req.param('id');

        const tabGroup = await ctx.models.tabs.read(parseInt(id ?? '', 10), user.id);

        if (!tabGroup) {
            throw new ctx.errors.NotFoundError('Tab group not found');
        }

        return c.render('tabs/tabs-launch.html', {
            title: `Tabs Launch: ${tabGroup.title}`,
            path: `/tabs/${String(id)}/launch`,
            layout: '_layouts/auth.html',
            tabGroup,
            tabs: tabGroup.items || [],
            user,
        });
    });

    router.get('/tabs/:id/items/create', ctx.middleware.authentication, async (c) => {
        const user = c.get('user') as User;
        const tabId = c.req.param('id');
        const tab = await ctx.db('tabs').where({ id: tabId, user_id: user.id }).first();

        if (!tab) {
            throw new ctx.errors.NotFoundError('Tab group not found');
        }

        return c.render('tabs/tabs-items-new.html', {
            title: 'Add Tab Item',
            path: `/tabs/${String(tabId)}/items/create`,
            layout: '_layouts/auth.html',
            tab,
            user,
        });
    });

    router.get('/tabs/:id/items/:itemId/edit', ctx.middleware.authentication, async (c) => {
        const user = c.get('user') as User;
        const id = c.req.param('id');
        const itemId = c.req.param('itemId');

        const tab = await ctx.db.select('*').from('tabs').where({ id, user_id: user.id }).first();

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

        return c.render('tabs/tabs-items-edit.html', {
            title: 'Edit Tab Item',
            path: `/tabs/${String(id)}/items/${String(itemId)}/edit`,
            layout: '_layouts/auth.html',
            tabItem,
            user,
        });
    });

    router.get('/tabs', ctx.middleware.authentication, getTabsPageHandler);
    async function getTabsPageHandler(c: AppContextContext) {
        const user = c.get('user') as User;
        const { perPage, page, search, sortKey, direction } =
            ctx.utils.request.extractPaginationParamsFromContext(c, 'tabs');

        const { data: tabsData, pagination } = await ctx.models.tabs.all({
            user,
            perPage,
            page,
            search,
            sortKey,
            direction,
        });

        ctx.utils.html.applyHighlighting(tabsData, ['title', 'trigger'], search);

        return c.render('tabs/tabs-index.html', {
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

    router.post(
        '/tabs',
        ctx.middleware.authentication,
        zValidator('form', tabFormSchema, (result) => {
            if (!result.success) {
                const errors: Record<string, string> = {};
                for (const issue of result.error.issues) {
                    errors[String(issue.path[0] ?? 'general')] ??= issue.message;
                }
                throw new ctx.errors.ValidationError(errors);
            }
        }),
        async (c) => {
            const user = c.get('user') as User;
            const { title, trigger } = c.req.valid('form');

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

            ctx.utils.search.invalidateTriggerCache(user.id);

            setFlash(c, 'success', 'Tab group created!');
            return c.redirect('/tabs');
        },
    );

    router.post(
        '/tabs/:id/update',
        ctx.middleware.authentication,
        zValidator('form', tabFormSchema, (result) => {
            if (!result.success) {
                const errors: Record<string, string> = {};
                for (const issue of result.error.issues) {
                    errors[String(issue.path[0] ?? 'general')] ??= issue.message;
                }
                throw new ctx.errors.ValidationError(errors);
            }
        }),
        async (c) => {
            const user = c.get('user') as User;
            const { title, trigger } = c.req.valid('form');
            const id = parseInt(c.req.param('id') ?? '', 10);

            const tab = await ctx.models.tabs.read(id, user.id);

            if (!tab) {
                throw new ctx.errors.NotFoundError('Tab group not found');
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

            await ctx.models.tabs.update(id, user.id, {
                title,
                trigger: formattedTrigger,
            });

            if (tab.trigger !== formattedTrigger) {
                ctx.utils.search.invalidateTriggerCache(user.id);
            }

            setFlash(c, 'success', 'Tab group updated!');
            return c.redirect('/tabs');
        },
    );

    router.post('/tabs/:id/delete', ctx.middleware.authentication, deleteTabHandler);
    router.post('/tabs/delete', ctx.middleware.authentication, deleteTabHandler);
    async function deleteTabHandler(c: AppContextContext) {
        const user = c.get('user') as User;
        const tabIds = ctx.utils.request.extractIdsForDeleteFromContext(c);
        const deletedCount = await ctx.models.tabs.delete(tabIds, user.id);

        if (!deletedCount) {
            throw new ctx.errors.NotFoundError('Tab group not found');
        }

        ctx.utils.search.invalidateTriggerCache(user.id);

        setFlash(
            c,
            'success',
            `${deletedCount} tab group${deletedCount !== 1 ? 's' : ''} deleted!`,
        );
        return c.redirect('/tabs');
    }

    router.post(
        '/tabs/:id/items/create',
        ctx.middleware.authentication,
        zValidator('form', tabItemFormSchema, (result) => {
            if (!result.success) {
                const errors: Record<string, string> = {};
                for (const issue of result.error.issues) {
                    errors[String(issue.path[0] ?? 'general')] ??= issue.message;
                }
                throw new ctx.errors.ValidationError(errors);
            }
        }),
        async (c) => {
            const user = c.get('user') as User;
            const tabId = c.req.param('id');
            const { title, url } = c.req.valid('form');

            const tab = await ctx.db('tabs').where({ id: tabId, user_id: user.id }).first();

            if (!tab) {
                throw new ctx.errors.NotFoundError('Tab group not found');
            }

            await ctx.db('tab_items').insert({
                tab_id: tab.id,
                title,
                url,
            });

            ctx.utils.util.prefetchAssets(url);

            setFlash(c, 'success', 'Tab item added!');
            return c.redirect('/tabs');
        },
    );

    router.post(
        '/tabs/:id/items/:itemId/update',
        ctx.middleware.authentication,
        zValidator('form', tabItemFormSchema, (result) => {
            if (!result.success) {
                const errors: Record<string, string> = {};
                for (const issue of result.error.issues) {
                    errors[String(issue.path[0] ?? 'general')] ??= issue.message;
                }
                throw new ctx.errors.ValidationError(errors);
            }
        }),
        async (c) => {
            const user = c.get('user') as User;
            const id = c.req.param('id');
            const itemId = c.req.param('itemId');
            const { title, url } = c.req.valid('form');

            const tab = await ctx.db('tabs').where({ id, user_id: user.id }).first();

            if (!tab) {
                throw new ctx.errors.NotFoundError('Tab group not found');
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

            setFlash(c, 'success', 'Tab item updated!');
            return c.redirect(`/tabs`);
        },
    );

    router.post(
        '/tabs/:id/items/:itemId/delete',
        ctx.middleware.authentication,
        deleteTabItemHandler,
    );
    async function deleteTabItemHandler(c: AppContextContext) {
        const user = c.get('user') as User;
        const tabId = parseInt(c.req.param('id') ?? '', 10);
        const itemId = parseInt(c.req.param('itemId') ?? '', 10);

        const tab = await ctx.db('tabs').where({ id: tabId, user_id: user.id }).first();

        if (!tab) {
            throw new ctx.errors.NotFoundError('Tab group not found');
        }

        const tabItem = await ctx.db('tab_items').where({ id: itemId, tab_id: tabId }).first();

        if (!tabItem) {
            throw new ctx.errors.NotFoundError('Tab item not found');
        }

        await ctx.db.transaction(async (trx) => {
            await trx('tab_items').where({ id: itemId, tab_id: tabId }).delete();
            await trx('tabs').where({ id: tabId }).update({ updated_at: ctx.db.fn.now() });
        });

        setFlash(c, 'success', 'Tab item deleted!');
        return c.redirect(`/tabs`);
    }

    const activePrefetches = new Set<number>();

    router.post('/tabs/prefetch', ctx.middleware.authentication, async (c) => {
        const user = c.get('user') as User;

        if (activePrefetches.has(user.id)) {
            setFlash(c, 'info', 'Screenshot caching already in progress...');
            return c.redirect('/tabs');
        }

        const tabItems = await ctx
            .db('tab_items')
            .select('tab_items.url')
            .join('tabs', 'tabs.id', 'tab_items.tab_id')
            .where('tabs.user_id', user.id)
            .limit(500);

        const urls = tabItems.map((t: { url: string }) => t.url).filter(Boolean);

        if (urls.length === 0) {
            setFlash(c, 'info', 'No URLs to cache');
            return c.redirect('/tabs');
        }

        activePrefetches.add(user.id);

        void ctx.utils.util
            .prefetchScreenshots(urls)
            .finally(() => activePrefetches.delete(user.id));

        setFlash(c, 'success', `Caching ${urls.length} preview images in background...`);
        return c.redirect('/tabs');
    });

    return router;
}
