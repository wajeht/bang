import type { AppContext, AppContextContext, AppEnv } from '../../type.js';
import { renderView, setFlash } from '../middleware.js';
import { Hono } from 'hono';

export function createAdminRouter(ctx: AppContext) {
    const router = new Hono<AppEnv>();

    router.get('/admin', ctx.middleware.authentication, ctx.middleware.adminOnly, async (c) => {
        return c.redirect('/admin/users');
    });

    // Identity settings
    router.get(
        '/admin/settings/identity',
        ctx.middleware.authentication,
        ctx.middleware.adminOnly,
        async (c) => {
            const branding = await ctx.models.settings.getBranding();

            return renderView(ctx, c, 'admin/admin-settings-identity.html', {
                user: c.get('user'),
                title: 'Admin / Identity',
                path: '/admin/settings/identity',
                layout: '_layouts/admin.html',
                branding,
            });
        },
    );

    router.post(
        '/admin/settings/identity',
        ctx.middleware.authentication,
        ctx.middleware.adminOnly,
        async (c) => {
            const body = c.get('body');

            await ctx.models.settings.setMany({
                'branding.app_name': body.app_name?.trim() || 'Bang',
                'branding.app_url': body.app_url?.trim() || '',
            });

            setFlash(c, 'success', 'Identity settings updated successfully');
            return c.redirect('/admin/settings/identity');
        },
    );

    // Visibility settings
    router.get(
        '/admin/settings/visibility',
        ctx.middleware.authentication,
        ctx.middleware.adminOnly,
        async (c) => {
            const branding = await ctx.models.settings.getBranding();

            return renderView(ctx, c, 'admin/admin-settings-visibility.html', {
                user: c.get('user'),
                title: 'Admin / Visibility',
                path: '/admin/settings/visibility',
                layout: '_layouts/admin.html',
                branding,
            });
        },
    );

    router.post(
        '/admin/settings/visibility',
        ctx.middleware.authentication,
        ctx.middleware.adminOnly,
        async (c) => {
            const body = c.get('body');

            await ctx.models.settings.setMany({
                'branding.show_footer': body.show_footer === 'on' ? 'true' : 'false',
                'branding.show_search_page': body.show_search_page === 'on' ? 'true' : 'false',
                'branding.show_about_page': body.show_about_page === 'on' ? 'true' : 'false',
            });

            setFlash(c, 'success', 'Visibility settings updated successfully');
            return c.redirect('/admin/settings/visibility');
        },
    );

    router.get(
        '/admin/users',
        ctx.middleware.authentication,
        ctx.middleware.adminOnly,
        async (c) => {
            const { perPage, page, search, sortKey, direction } =
                ctx.utils.request.extractPaginationParamsFromContext(c, 'admin');

            const query = ctx.db.select('*').from('users');

            if (search) {
                query.where((q) =>
                    q
                        .whereRaw('LOWER(username) LIKE ?', [`%${search.toLowerCase()}%`])
                        .orWhereRaw('LOWER(email) LIKE ?', [`%${search.toLowerCase()}%`]),
                );
            }

            const { data, pagination } = await query
                .orderBy(sortKey || 'created_at', direction || 'desc')
                .paginate({ perPage, currentPage: page, isLengthAware: true });

            return renderView(ctx, c, 'admin/admin-users-index.html', {
                user: c.get('user'),
                title: 'Admin / Users',
                path: '/admin/users',
                layout: '_layouts/admin.html',
                data,
                pagination,
                search,
                sortKey,
                direction,
            });
        },
    );

    router.post(
        '/admin/users/:id/delete',
        ctx.middleware.authentication,
        ctx.middleware.adminOnly,
        deleteUserHandler,
    );
    router.post(
        '/admin/users/delete',
        ctx.middleware.authentication,
        ctx.middleware.adminOnly,
        deleteUserHandler,
    );
    async function deleteUserHandler(c: AppContextContext) {
        const id = c.req.param('id');
        const user = c.get('user');

        if (id) {
            const userId = parseInt(id, 10);

            if (user?.is_admin && user.id === userId) {
                setFlash(c, 'info', 'you cannot delete yourself');
                return c.redirect('/admin/users');
            }
        }

        const userIds = ctx.utils.request.extractIdsForDeleteFromContext(c);

        const deletedCount = await ctx.db.transaction(async (trx) => {
            const rowsAffected = await trx('users')
                .whereIn('id', userIds)
                .where('is_admin', false)
                .delete();

            return rowsAffected;
        });

        if (!deletedCount) {
            throw new ctx.errors.NotFoundError('User not found');
        }

        setFlash(
            c,
            'success',
            `${deletedCount} user${deletedCount !== 1 ? 's' : ''} deleted successfully`,
        );
        return c.redirect('/admin/users');
    }

    return router;
}
