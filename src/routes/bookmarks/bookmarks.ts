import {
    addToTabs,
    isValidUrl,
    isApiRequest,
    insertBookmark,
    extractPagination,
    checkDuplicateBookmarkUrl,
    generateBookmarkHtmlExport,
} from '../../utils/util';
import type { Knex } from 'knex';
import dayjs from '../../utils/dayjs';
import { NotFoundError, ValidationError } from '../../error';
import express, { type Request, type Response } from 'express';
import { authenticationMiddleware } from '../../routes/middleware';
import type { User, Bookmarks, BookmarkToExport } from '../../type';

export function createBookmarksRouter(db: Knex, bookmarks: Bookmarks) {
    const router = express.Router();

    /**
     * A bookmark
     * @typedef {object} Bookmark
     * @property {number} id - bookmark id
     * @property {string} url.required - bookmark url
     * @property {string} title.required - bookmark title
     * @property {string} description - bookmark description
     * @property {string} created_at - creation timestamp
     * @property {string} updated_at - last update timestamp
     */

    /**
     *
     * GET /api/bookmarks
     *
     * @tags Bookmarks
     * @summary get bookmarks
     *
     * @security BearerAuth
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     *
     */
    router.get('/api/bookmarks', authenticationMiddleware, getBookmarksHandler);
    router.get('/bookmarks', authenticationMiddleware, getBookmarksHandler);
    async function getBookmarksHandler(req: Request, res: Response) {
        const user = req.user as User;
        const { perPage, page, search, sortKey, direction } = extractPagination(req, 'bookmarks');

        const { data, pagination } = await bookmarks.all({
            user,
            perPage,
            page,
            search,
            sortKey,
            direction,
            highlight: !isApiRequest(req),
            excludeHidden: true,
        });

        if (isApiRequest(req)) {
            res.json({ data, pagination, search, sortKey, direction });
            return;
        }

        return res.render('bookmarks/bookmarks-get.html', {
            user: req.session?.user,
            title: 'Bookmarks',
            path: '/bookmarks',
            layout: '_layouts/auth.html',
            data,
            search,
            pagination,
            sortKey,
            direction,
        });
    }

    router.get(
        '/bookmarks/create',
        authenticationMiddleware,
        async (_req: Request, res: Response) => {
            return res.render('bookmarks/bookmarks-create.html', {
                title: 'Bookmarks / New',
                path: '/bookmarks/create',
                layout: '_layouts/auth.html',
            });
        },
    );

    router.get(
        '/bookmarks/export',
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            const userId = req.session.user?.id;

            if (!userId) {
                throw new NotFoundError('User not found');
            }

            const bookmarksData = (await db
                .select('url', 'title', db.raw("strftime('%s', created_at) as add_date"))
                .from('bookmarks')
                .where({ user_id: userId })) as BookmarkToExport[];

            if (!bookmarksData.length) {
                req.flash('info', 'no bookmarks to export yet.');
                return res.redirect('/bookmarks');
            }

            const htmlExport = await generateBookmarkHtmlExport(userId);

            res.setHeader(
                'Content-Disposition',
                `attachment; filename=bookmarks-${dayjs().format('YYYY-MM-DD')}.html`,
            )
                .setHeader('Content-Type', 'text/html; charset=UTF-8')
                .send(htmlExport);
        },
    );

    router.get(
        '/bookmarks/:id/edit',
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            const bookmark = await bookmarks.read(
                req.params.id as unknown as number,
                (req.user as User).id,
            );

            if (!bookmark) {
                throw new NotFoundError('Bookmark not found');
            }

            return res.render('bookmarks/bookmarks-edit.html', {
                title: 'Bookmarks / Edit',
                path: '/bookmarks/edit',
                layout: '_layouts/auth.html',
                bookmark,
            });
        },
    );

    router.get(
        '/bookmarks/:id/tabs/create',
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            const id = parseInt(req.params.id as unknown as string);
            const bookmark = await db('bookmarks')
                .where({
                    id,
                    user_id: req.session.user?.id,
                })
                .first();

            if (!bookmark) {
                throw new NotFoundError('Bookmark not found');
            }

            const tabs = await db('tabs').where({ user_id: req.session.user?.id });

            return res.render('bookmarks/bookmarks-id-tabs-create.html', {
                title: `Bookmarks / ${id} / Tabs / Create`,
                path: `/bookmarks/${id}/tabs/create`,
                layout: '_layouts/auth.html',
                bookmark,
                tabs,
            });
        },
    );

    router.get(
        '/bookmarks/:id/actions/create',
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            const bookmark = await db('bookmarks')
                .where({
                    id: req.params.id,
                    user_id: req.session.user?.id,
                })
                .first();

            return res.render('bookmarks/bookmarks-id-actions-create.html', {
                title: `Bookmarks / ${req.params.id} / Actions / Create`,
                path: `/bookmarks/${req.params.id}/actions/create`,
                layout: '_layouts/auth.html',
                bookmark,
            });
        },
    );

    /**
     *
     * POST /api/bookmarks
     *
     * @tags Bookmarks
     * @summary create a bookmark
     *
     * @security BearerAuth
     *
     * @param {Bookmark} request.body.required - bookmark info
     *
     * @return {object} 201 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     *
     */
    router.post('/api/bookmarks', authenticationMiddleware, postBookmarkHandler);
    router.post('/bookmarks', authenticationMiddleware, postBookmarkHandler);
    async function postBookmarkHandler(req: Request, res: Response) {
        const { url, title, pinned, hidden } = req.body;

        if (!title) {
            throw new ValidationError({ title: 'Title is required' });
        }

        if (!url) {
            throw new ValidationError({ url: 'URL is required' });
        }

        if (!isValidUrl(url)) {
            throw new ValidationError({ url: 'Invalid URL format' });
        }

        if (pinned !== undefined && typeof pinned !== 'boolean' && pinned !== 'on') {
            throw new ValidationError({ pinned: 'Pinned must be a boolean or checkbox value' });
        }

        if (hidden !== undefined && typeof hidden !== 'boolean' && hidden !== 'on') {
            throw new ValidationError({ hidden: 'Hidden must be a boolean or checkbox value' });
        }

        const user = req.user as User;

        if (hidden === 'on' || hidden === true) {
            if (!user.hidden_items_password) {
                throw new ValidationError({
                    hidden: 'You must set a global password in settings before hiding items',
                });
            }
        }
        const existingBookmark = await checkDuplicateBookmarkUrl(user.id, url);

        if (existingBookmark) {
            throw new ValidationError({
                url: `URL already bookmarked as "${existingBookmark.title}". Please use a different URL or update the existing bookmark.`,
            });
        }

        setTimeout(
            () =>
                insertBookmark({
                    url,
                    userId: (req.user as User).id,
                    title,
                    pinned: pinned === 'on' || pinned === true,
                    hidden: hidden === 'on' || hidden === true,
                    req,
                }),
            0,
        );

        if (isApiRequest(req)) {
            res.status(201).json({ message: `Bookmark ${title} created successfully!` });
            return;
        }

        req.flash('success', `Bookmark ${title} created successfully!`);
        return res.redirect('/bookmarks');
    }

    /**
     *
     * PATCH /api/bookmarks/{id}
     *
     * @tags Bookmarks
     * @summary update a bookmark
     *
     * @security BearerAuth
     *
     * @param {number} id.path.required - bookmark id
     * @param {Bookmark} request.body.required - bookmark info
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.patch('/api/bookmarks/:id', authenticationMiddleware, updateBookmarkHandler);
    router.post('/bookmarks/:id/update', authenticationMiddleware, updateBookmarkHandler);
    async function updateBookmarkHandler(req: Request, res: Response) {
        const { url, title, pinned, hidden } = req.body;

        if (!title) {
            throw new ValidationError({ title: 'Title is required' });
        }

        if (!url) {
            throw new ValidationError({ url: 'URL is required' });
        }

        if (!isValidUrl(url)) {
            throw new ValidationError({ url: 'Invalid URL format' });
        }

        if (pinned !== undefined && typeof pinned !== 'boolean' && pinned !== 'on') {
            throw new ValidationError({ pinned: 'Pinned must be a boolean or checkbox value' });
        }

        if (hidden !== undefined && typeof hidden !== 'boolean' && hidden !== 'on') {
            throw new ValidationError({ hidden: 'Hidden must be a boolean or checkbox value' });
        }

        const user = req.user as User;
        const bookmarkId = req.params.id as unknown as number;

        if (hidden === 'on' || hidden === true) {
            if (!user.hidden_items_password) {
                throw new ValidationError({
                    hidden: 'You must set a global password in settings before hiding items',
                });
            }
        }

        const updatedBookmark = await bookmarks.update(bookmarkId, user.id, {
            url,
            title,
            pinned: pinned === 'on' || pinned === true,
            hidden: hidden === 'on' || hidden === true,
        });

        if (isApiRequest(req)) {
            res.status(200).json({
                message: `Bookmark ${updatedBookmark.title} updated successfully!`,
                data: updatedBookmark,
            });
            return;
        }

        req.flash('success', `Bookmark ${updatedBookmark.title} updated successfully!`);
        return res.redirect('/bookmarks');
    }

    /**
     *
     * DELETE /api/bookmarks/{id}
     *
     * @tags Bookmarks
     * @summary delete a bookmark
     *
     * @security BearerAuth
     *
     * @param {number} id.path.required - bookmark id
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.delete('/api/bookmarks/:id', authenticationMiddleware, deleteBookmarkHandler);
    router.post('/bookmarks/:id/delete', authenticationMiddleware, deleteBookmarkHandler);
    async function deleteBookmarkHandler(req: Request, res: Response) {
        const deleted = await bookmarks.delete(
            req.params.id as unknown as number,
            (req.user as User).id,
        );

        if (!deleted) {
            throw new NotFoundError('Bookmark not found');
        }

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'Bookmark deleted successfully' });
            return;
        }

        req.flash('success', 'Bookmark deleted successfully');
        return res.redirect('/bookmarks');
    }

    /**
     * POST /api/bookmarks/{id}/pin
     *
     * @tags Bookmarks
     * @summary Toggle pin status of a bookmark
     *
     * @security BearerAuth
     *
     * @param {string} id.path.required - bookmark id
     *
     * @return {object} 200 - success response - application/json
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.post('/bookmarks/:id/pin', authenticationMiddleware, toggleBookmarkPinHandler);
    router.post('/api/bookmarks/:id/pin', authenticationMiddleware, toggleBookmarkPinHandler);
    async function toggleBookmarkPinHandler(req: Request, res: Response) {
        const user = req.user as User;
        const bookmarkId = parseInt(req.params.id as unknown as string);

        const currentBookmark = await bookmarks.read(bookmarkId, user.id);

        if (!currentBookmark) {
            throw new NotFoundError('Bookmark not found');
        }

        const updatedBookmark = await bookmarks.update(bookmarkId, user.id, {
            pinned: !currentBookmark.pinned,
        });

        if (isApiRequest(req)) {
            res.status(200).json({
                message: `Bookmark ${updatedBookmark.pinned ? 'pinned' : 'unpinned'} successfully`,
                data: updatedBookmark,
            });
            return;
        }

        req.flash(
            'success',
            `Bookmark ${updatedBookmark.pinned ? 'pinned' : 'unpinned'} successfully`,
        );
        return res.redirect('/bookmarks');
    }

    /**
     *
     * GET /api/bookmarks/{id}
     *
     * @tags Bookmarks
     * @summary get a specific bookmark
     *
     * @security BearerAuth
     *
     * @param {number} id.path.required - bookmark id
     *
     * @return {Bookmark} 200 - success response - application/json
     * @return {object} 400 - Bad request response - application/json
     * @return {object} 404 - Not found response - application/json
     *
     */
    router.get(
        '/api/bookmarks/:id',
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const bookmark = await bookmarks.read(
                parseInt(req.params.id as unknown as string),
                user.id,
            );

            if (!bookmark) {
                throw new NotFoundError('Bookmark not found');
            }

            res.status(200).json({
                message: 'Bookmark retrieved successfully',
                data: bookmark,
            });
        },
    );

    router.post(
        '/bookmarks/:id/tabs',
        authenticationMiddleware,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const tab_id = parseInt(req.body.tab_id as unknown as string);
            const id = parseInt(req.params.id as unknown as string);

            await addToTabs(user.id, tab_id, 'bookmarks', id);

            if (isApiRequest(req)) {
                res.status(201).json({ message: 'Tab added successfully' });
                return;
            }

            req.flash('success', 'Tab added!');
            return res.redirect('/bookmarks');
        },
    );

    return router;
}
