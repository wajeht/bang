import type { AppContextContext, AppEnv } from '../../http.js';
import { renderView, setFlash } from '../../http.js';
import type { User, AppContext } from '../../type.js';
import { Hono } from 'hono';

export function createActionsRouter(ctx: AppContext) {
    const router = new Hono<AppEnv>();

    router.get('/actions', ctx.middleware.authentication, getActionsHandler);
    async function getActionsHandler(c: AppContextContext) {
        const user = c.get('user') as User;
        const { perPage, page, search, sortKey, direction } =
            ctx.utils.request.extractPaginationParamsFromContext(c, 'actions');

        const { canViewHidden, hasVerifiedPassword } =
            ctx.utils.request.canViewHiddenItemsFromContext(c, user);

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

        return renderView(ctx, c, 'actions/actions-index.html', {
            user: c.get('session').user,
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

    router.get('/actions/create', ctx.middleware.authentication, async (c) => {
        return renderView(ctx, c, 'actions/actions-new.html', {
            title: 'Actions / New',
            path: '/actions/create',
            layout: '_layouts/auth.html',
            actionTypes: ctx.utils.util.ACTION_TYPES,
        });
    });

    router.get('/actions/:id/edit', ctx.middleware.authentication, async (c) => {
        const action = await ctx.db
            .select('bangs.*')
            .from('bangs')
            .where({
                'bangs.id': c.req.param('id'),
                'bangs.user_id': (c.get('user') as User).id,
            })
            .first();

        if (!action) {
            throw new ctx.errors.NotFoundError('Action not found');
        }

        return renderView(ctx, c, 'actions/actions-edit.html', {
            title: 'Actions / Edit',
            path: '/actions/edit',
            layout: '_layouts/auth.html',
            action,
        });
    });

    router.get('/actions/:id/tabs/create', ctx.middleware.authentication, async (c) => {
        const id = parseInt(c.req.param('id'), 10);
        const session = c.get('session');
        const action = await ctx
            .db('bangs')
            .where({
                id,
                user_id: session.user?.id,
            })
            .first();

        if (!action) {
            throw new ctx.errors.NotFoundError('Actions not found');
        }

        const tabs = await ctx.db('tabs').where({ user_id: session.user?.id });

        return renderView(ctx, c, 'actions/actions-tabs-new.html', {
            title: `Actions / ${String(id)} / Tabs / Create`,
            path: `/actions/${String(id)}/tabs/create`,
            layout: '_layouts/auth.html',
            action,
            tabs,
        });
    });

    router.post('/actions', ctx.middleware.authentication, postActionHandler);
    async function postActionHandler(c: AppContextContext) {
        const { url, name, actionType, trigger, hidden } = c.get('body');
        const user = c.get('user') as User;

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

        if (actionType === 'redirect') {
            ctx.utils.util.prefetchAssets(url);
        }

        ctx.utils.search.invalidateTriggerCache(user.id);

        setFlash(c, 'success', `Action ${formattedTrigger} created successfully!`);
        return c.redirect('/actions');
    }

    router.post('/actions/:id/update', ctx.middleware.authentication, updateActionHandler);
    async function updateActionHandler(c: AppContextContext) {
        const { url, name, actionType, trigger, hidden } = c.get('body');
        const user = c.get('user') as User;
        const actionId = parseInt(c.req.param('id') ?? '', 10);

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
            .whereNot('id', c.req.param('id'))
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
            ctx.utils.search.invalidateTriggerCache(user.id);
        }

        setFlash(c, 'success', `Action ${updatedAction.trigger} updated successfully!`);

        if (updatedAction.hidden && !currentAction.hidden) {
            setFlash(c, 'success', 'Action hidden successfully');
            return c.redirect('/actions');
        }

        return c.redirect('/actions');
    }

    router.post('/actions/:id/delete', ctx.middleware.authentication, deleteActionHandler);
    router.post('/actions/delete', ctx.middleware.authentication, deleteActionHandler);
    async function deleteActionHandler(c: AppContextContext) {
        const user = c.get('user') as User;
        const actionIds = ctx.utils.request.extractIdsForDeleteFromContext(c);
        const deletedCount = await ctx.models.actions.delete(actionIds, user.id);

        if (!deletedCount) {
            throw new ctx.errors.NotFoundError('Action not found');
        }

        ctx.utils.search.invalidateTriggerCache(user.id);

        setFlash(
            c,
            'success',
            `${deletedCount} action${deletedCount !== 1 ? 's' : ''} deleted successfully`,
        );
        return c.redirect('/actions');
    }

    router.post('/actions/:id/hide', ctx.middleware.authentication, toggleActionHideHandler);
    async function toggleActionHideHandler(c: AppContextContext) {
        const user = c.get('user') as User;
        const body = c.get('body');
        const actionId = parseInt(c.req.param('id') ?? '', 10);

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

        setFlash(
            c,
            'success',
            `Action ${updatedAction.hidden ? 'hidden' : 'unhidden'} successfully`,
        );
        const showHidden = body.showHidden === 'true';
        return c.redirect('/actions' + (showHidden ? '?hidden=true' : ''));
    }

    router.post('/actions/:id/tabs', ctx.middleware.authentication, async (c) => {
        const user = c.get('user') as User;
        const body = c.get('body');
        const tab_id = parseInt(body.tab_id, 10);
        const id = parseInt(c.req.param('id'), 10);

        await ctx.utils.util.addToTabs(user.id, tab_id, 'bangs', id);

        setFlash(c, 'success', 'Tab added!');
        return c.redirect('/actions');
    });

    const activePrefetches = new Set<number>();

    router.post('/actions/prefetch', ctx.middleware.authentication, async (c) => {
        const user = c.get('user') as User;

        if (activePrefetches.has(user.id)) {
            setFlash(c, 'info', 'Screenshot caching already in progress...');
            return c.redirect('/actions');
        }

        const actions = await ctx
            .db('bangs')
            .select('url')
            .where({ user_id: user.id })
            .whereNotNull('url')
            .limit(500);

        if (actions.length === 0) {
            setFlash(c, 'warning', "You don't have any actions at the moment!");
            return c.redirect('/actions');
        }

        const urls = actions.map((a: { url: string }) => a.url).filter(Boolean);

        if (urls.length === 0) {
            setFlash(c, 'info', 'No URLs to cache');
            return c.redirect('/actions');
        }

        activePrefetches.add(user.id);

        void ctx.utils.util
            .prefetchScreenshots(urls)
            .finally(() => activePrefetches.delete(user.id));

        setFlash(c, 'success', `Caching ${urls.length} preview images in background...`);
        return c.redirect('/actions');
    });

    return router;
}
