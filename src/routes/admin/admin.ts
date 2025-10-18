import type { Request, Response } from 'express';
import type { AppContext } from '../../type';

export function AdminRouter(context: AppContext) {
    const router = context.libs.express.Router();

    router.get(
        '/admin',
        context.middleware.authentication,
        context.middleware.adminOnly,
        async (_req: Request, res: Response) => {
            return res.redirect('/admin/users');
        },
    );

    router.get(
        '/admin/users',
        context.middleware.authentication,
        context.middleware.adminOnly,
        async (req: Request, res: Response) => {
            const { perPage, page, search, sortKey, direction } =
                context.utils.request.extractPaginationParams(req, 'admin');

            const query = context.db.select('*').from('users');

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
        context.middleware.authentication,
        context.middleware.adminOnly,
        async (req: Request, res: Response) => {
            const userId = parseInt(req.params.id as unknown as string);

            if (req.user?.is_admin && req.user?.id === userId) {
                req.flash('info', 'you cannot delete yourself');
                return res.redirect('/admin/users');
            }

            const user = await context.db('users').where({ id: userId }).delete();

            if (!user) {
                throw new context.errors.NotFoundError('User not found');
            }

            req.flash('success', 'deleted');
            return res.redirect('/admin/users');
        },
    );

    router.post(
        '/admin/users/delete-bulk',
        context.middleware.authentication,
        context.middleware.adminOnly,
        async (req: Request, res: Response) => {
            const { id } = req.body;

            if (!id || !Array.isArray(id)) {
                throw new context.errors.ValidationError({ id: 'IDs array is required' });
            }

            const userIds = id.map((id: string) => parseInt(id)).filter((id: number) => !isNaN(id));

            if (userIds.length === 0) {
                throw new context.errors.ValidationError({ id: 'No valid user IDs provided' });
            }

            const deletedCount = await context.db.transaction(async (trx) => {
                const rowsAffected = await trx('users')
                    .whereIn('id', userIds)
                    .where('is_admin', false)
                    .delete();

                return rowsAffected;
            });

            req.flash(
                'success',
                `${deletedCount} user${deletedCount !== 1 ? 's' : ''} deleted successfully`,
            );
            return res.redirect('/admin/users');
        },
    );

    return router;
}
