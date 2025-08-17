import express from 'express';
import type { Knex } from 'knex';
import { NotFoundError } from '../error';
import type { Request, Response } from 'express';
import { extractPagination } from '../utils/util';
import { authenticationMiddleware, adminOnlyMiddleware } from '../middleware';

export function createAdminRouter(db: Knex) {
    const router = express.Router();

    router.get(
        '/admin',
        authenticationMiddleware,
        adminOnlyMiddleware,
        async (_req: Request, res: Response) => {
            return res.redirect('/admin/users');
        },
    );

    router.get(
        '/admin/users',
        authenticationMiddleware,
        adminOnlyMiddleware,
        async (req: Request, res: Response) => {
            const { perPage, page, search, sortKey, direction } = extractPagination(req, 'admin');

            const query = db.select('*').from('users');

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

            return res.render('./admin/admin-users.html', {
                user: req.session?.user,
                title: 'Admin / Users',
                path: '/admin/users',
                layout: '../layouts/admin.html',
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
        authenticationMiddleware,
        adminOnlyMiddleware,
        async (req: Request, res: Response) => {
            const userId = parseInt(req.params.id as unknown as string);

            if (req.user?.is_admin && req.user?.id === userId) {
                req.flash('info', 'you cannot delete yourself');
                return res.redirect('/admin/users');
            }

            const user = await db('users').where({ id: userId }).delete();

            if (!user) {
                throw new NotFoundError('User not found');
            }

            req.flash('success', 'deleted');
            return res.redirect('/admin/users');
        },
    );

    return router;
}
