import express, { Request, Response } from 'express';
import { Knex } from 'knex';
import { extractPagination } from '../utils/util';
import { NotFoundError } from '../error';

export function createAdminRoutes(db: Knex) {
    const router = express.Router();

    router.get('/admin', getUsersHandler);
    router.get('/admin/users', getUsersHandler);
    async function getUsersHandler(req: Request, res: Response) {
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
    }

    router.post('/admin/users/:id/delete', async (req: Request, res: Response) => {
        const userIdParam = req.params.id;
        if (!userIdParam) {
            throw new NotFoundError('User ID is required');
        }

        const userId = parseInt(userIdParam);

        if (!userId) {
            throw new NotFoundError('User ID is required');
        }

        if (userId === req.session?.user?.id) {
            req.flash('error', 'You cannot delete your own account from here.');
            return res.redirect('/admin/users');
        }

        const user = await db('users').where({ id: userId }).delete();

        if (!user) {
            throw new NotFoundError('User not found');
        }

        req.flash('success', 'deleted');
        return res.redirect('/admin/users');
    });

    return router;
}
