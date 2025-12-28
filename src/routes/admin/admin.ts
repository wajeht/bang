import type { AppContext } from '../../type';
import type { Request, Response, NextFunction } from 'express';

export function AdminRouter(ctx: AppContext) {
    const router = ctx.libs.express.Router();

    router.get(
        '/admin',
        ctx.middleware.authentication,
        ctx.middleware.adminOnly,
        async (_req: Request, res: Response) => {
            return res.redirect('/admin/users');
        },
    );

    // Identity settings
    router.get(
        '/admin/settings/identity',
        ctx.middleware.authentication,
        ctx.middleware.adminOnly,
        async (req: Request, res: Response) => {
            const branding = await ctx.models.settings.getBranding();

            return res.render('admin/admin-settings-identity.html', {
                user: req.session?.user,
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
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { app_name, app_url } = req.body;

                await ctx.models.settings.setMany({
                    'branding.app_name': (app_name as string)?.trim() || 'Bang',
                    'branding.app_url': (app_url as string)?.trim() || '',
                });

                req.flash('success', 'Identity settings updated successfully');
                return res.redirect('/admin/settings/identity');
            } catch (error) {
                next(error);
            }
        },
    );

    // Visibility settings
    router.get(
        '/admin/settings/visibility',
        ctx.middleware.authentication,
        ctx.middleware.adminOnly,
        async (req: Request, res: Response) => {
            const branding = await ctx.models.settings.getBranding();

            return res.render('admin/admin-settings-visibility.html', {
                user: req.session?.user,
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
        async (req: Request, res: Response, next: NextFunction) => {
            try {
                const { show_footer, show_search_page, show_about_page } = req.body;

                await ctx.models.settings.setMany({
                    'branding.show_footer': show_footer === 'on' ? 'true' : 'false',
                    'branding.show_search_page': show_search_page === 'on' ? 'true' : 'false',
                    'branding.show_about_page': show_about_page === 'on' ? 'true' : 'false',
                });

                req.flash('success', 'Visibility settings updated successfully');
                return res.redirect('/admin/settings/visibility');
            } catch (error) {
                next(error);
            }
        },
    );

    router.get(
        '/admin/users',
        ctx.middleware.authentication,
        ctx.middleware.adminOnly,
        async (req: Request, res: Response) => {
            const { perPage, page, search, sortKey, direction } =
                ctx.utils.request.extractPaginationParams(req, 'admin');

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

            return res.render('admin/admin-users.html', {
                user: req.session?.user,
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
    async function deleteUserHandler(req: Request, res: Response) {
        if (req.params.id) {
            const userId = parseInt(req.params.id as unknown as string);

            if (req.user?.is_admin && req.user?.id === userId) {
                req.flash('info', 'you cannot delete yourself');
                return res.redirect('/admin/users');
            }
        }

        const userIds = ctx.utils.request.extractIdsForDelete(req);

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

        req.flash(
            'success',
            `${deletedCount} user${deletedCount !== 1 ? 's' : ''} deleted successfully`,
        );
        return res.redirect('/admin/users');
    }

    return router;
}
