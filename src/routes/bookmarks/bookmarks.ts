import type { Request, Response } from 'express';
import type { User, BookmarkToExport, AppContext } from '../../type';

export function BookmarksRouter(ctx: AppContext) {
    const router = ctx.libs.express.Router();

    /**
     * @openapi
     * /api/bookmarks:
     *   get:
     *     tags:
     *       - Bookmarks
     *     summary: Get all bookmarks
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: query
     *         name: page
     *         schema:
     *           type: integer
     *       - in: query
     *         name: perPage
     *         schema:
     *           type: integer
     *       - in: query
     *         name: search
     *         schema:
     *           type: string
     *       - in: query
     *         name: sortKey
     *         schema:
     *           type: string
     *       - in: query
     *         name: direction
     *         schema:
     *           type: string
     *           enum: [asc, desc]
     *       - in: query
     *         name: hidden
     *         schema:
     *           type: boolean
     *     responses:
     *       200:
     *         description: Success response
     *       400:
     *         description: Bad request
     */
    router.get('/api/bookmarks', ctx.middleware.authentication, getBookmarksHandler);
    router.get('/bookmarks', ctx.middleware.authentication, getBookmarksHandler);
    async function getBookmarksHandler(req: Request, res: Response) {
        const user = req.user as User;
        const { perPage, page, search, sortKey, direction } =
            ctx.utils.request.extractPaginationParams(req, 'bookmarks');

        // Check if user wants to show hidden items and has verified password
        const showHidden = req.query.hidden === 'true';
        const hasVerifiedPassword =
            req.session?.hiddenItemsVerified &&
            req.session?.hiddenItemsVerifiedAt &&
            Date.now() - req.session.hiddenItemsVerifiedAt < 30 * 60 * 1000; // 30 minutes

        const canViewHidden = showHidden && hasVerifiedPassword && user.hidden_items_password;

        const { data, pagination } = await ctx.models.bookmarks.all({
            user,
            perPage,
            page,
            search,
            sortKey,
            direction,
            highlight: !ctx.utils.auth.isApiRequest(req),
            excludeHidden: !canViewHidden,
        });

        if (ctx.utils.auth.isApiRequest(req)) {
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
            showHidden: canViewHidden,
            hiddenItemsVerified: hasVerifiedPassword,
        });
    }

    router.get(
        '/bookmarks/create',
        ctx.middleware.authentication,
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
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const userId = req.session.user?.id;

            if (!userId) {
                throw new ctx.errors.NotFoundError('User not found');
            }

            const bookmarksData = (await ctx.db
                .select('url', 'title', ctx.db.raw("strftime('%s', created_at) as add_date"))
                .from('bookmarks')
                .where({ user_id: userId })) as BookmarkToExport[];

            if (!bookmarksData.length) {
                req.flash('info', 'no bookmarks to export yet.');
                return res.redirect('/bookmarks');
            }

            const htmlExport = await ctx.utils.util.generateBookmarkHtmlExport(userId);

            res.setHeader(
                'Content-Disposition',
                `attachment; filename=bookmarks-${ctx.libs.dayjs().format('YYYY-MM-DD')}.html`,
            )
                .setHeader('Content-Type', 'text/html; charset=UTF-8')
                .send(htmlExport);
        },
    );

    router.get(
        '/bookmarks/:id/edit',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const bookmark = await ctx.models.bookmarks.read(
                req.params.id as unknown as number,
                (req.user as User).id,
            );

            if (!bookmark) {
                throw new ctx.errors.NotFoundError('Bookmark not found');
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
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const id = parseInt(req.params.id as unknown as string);
            const bookmark = await ctx
                .db('bookmarks')
                .where({
                    id,
                    user_id: req.session.user?.id,
                })
                .first();

            if (!bookmark) {
                throw new ctx.errors.NotFoundError('Bookmark not found');
            }

            const tabs = await ctx.db('tabs').where({ user_id: req.session.user?.id });

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
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const bookmark = await ctx
                .db('bookmarks')
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
     * @openapi
     * /api/bookmarks:
     *   post:
     *     tags:
     *       - Bookmarks
     *     summary: Create a bookmark
     *     security:
     *       - BearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - title
     *               - url
     *             properties:
     *               title:
     *                 type: string
     *               url:
     *                 type: string
     *               pinned:
     *                 type: boolean
     *               hidden:
     *                 type: boolean
     *     responses:
     *       201:
     *         description: Created successfully
     *       400:
     *         description: Bad request
     */
    router.post('/api/bookmarks', ctx.middleware.authentication, postBookmarkHandler);
    router.post('/bookmarks', ctx.middleware.authentication, postBookmarkHandler);
    async function postBookmarkHandler(req: Request, res: Response) {
        const { url, title, pinned, hidden } = req.body;

        if (!title) {
            throw new ctx.errors.ValidationError({ title: 'Title is required' });
        }

        if (!url) {
            throw new ctx.errors.ValidationError({ url: 'URL is required' });
        }

        if (!ctx.utils.validation.isValidUrl(url)) {
            throw new ctx.errors.ValidationError({ url: 'Invalid URL format' });
        }

        if (pinned !== undefined && typeof pinned !== 'boolean' && pinned !== 'on') {
            throw new ctx.errors.ValidationError({
                pinned: 'Pinned must be a boolean or checkbox value',
            });
        }

        if (hidden !== undefined && typeof hidden !== 'boolean' && hidden !== 'on') {
            throw new ctx.errors.ValidationError({
                hidden: 'Hidden must be a boolean or checkbox value',
            });
        }

        const user = req.user as User;

        if (hidden === 'on' || hidden === true) {
            if (!user.hidden_items_password) {
                throw new ctx.errors.ValidationError({
                    hidden: 'You must set a global password in settings before hiding items',
                });
            }
        }
        const existingBookmark = await ctx.utils.util.checkDuplicateBookmarkUrl(user.id, url);

        if (existingBookmark) {
            throw new ctx.errors.ValidationError({
                url: `URL already bookmarked as "${existingBookmark.title}". Please use a different URL or update the existing bookmark.`,
            });
        }

        setTimeout(
            () =>
                ctx.utils.util.insertBookmark({
                    url,
                    userId: (req.user as User).id,
                    title,
                    pinned: pinned === 'on' || pinned === true,
                    hidden: hidden === 'on' || hidden === true,
                    req,
                }),
            0,
        );

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(201).json({ message: `Bookmark ${title} created successfully!` });
            return;
        }

        req.flash('success', `Bookmark ${title} created successfully!`);
        return res.redirect('/bookmarks');
    }

    /**
     * @openapi
     * /api/bookmarks/{id}:
     *   patch:
     *     tags:
     *       - Bookmarks
     *     summary: Update a bookmark
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             properties:
     *               title:
     *                 type: string
     *               url:
     *                 type: string
     *               pinned:
     *                 type: boolean
     *               hidden:
     *                 type: boolean
     *     responses:
     *       200:
     *         description: Updated successfully
     *       400:
     *         description: Bad request
     *       404:
     *         description: Not found
     */
    router.patch('/api/bookmarks/:id', ctx.middleware.authentication, updateBookmarkHandler);
    router.post('/bookmarks/:id/update', ctx.middleware.authentication, updateBookmarkHandler);
    async function updateBookmarkHandler(req: Request, res: Response) {
        const { url, title, pinned, hidden } = req.body;

        if (!title) {
            throw new ctx.errors.ValidationError({ title: 'Title is required' });
        }

        if (!url) {
            throw new ctx.errors.ValidationError({ url: 'URL is required' });
        }

        if (!ctx.utils.validation.isValidUrl(url)) {
            throw new ctx.errors.ValidationError({ url: 'Invalid URL format' });
        }

        if (pinned !== undefined && typeof pinned !== 'boolean' && pinned !== 'on') {
            throw new ctx.errors.ValidationError({
                pinned: 'Pinned must be a boolean or checkbox value',
            });
        }

        if (hidden !== undefined && typeof hidden !== 'boolean' && hidden !== 'on') {
            throw new ctx.errors.ValidationError({
                hidden: 'Hidden must be a boolean or checkbox value',
            });
        }

        const user = req.user as User;
        const bookmarkId = req.params.id as unknown as number;

        if (hidden === 'on' || hidden === true) {
            if (!user.hidden_items_password) {
                throw new ctx.errors.ValidationError({
                    hidden: 'You must set a global password in settings before hiding items',
                });
            }
        }

        const currentBookmark = await ctx.models.bookmarks.read(bookmarkId, user.id);
        if (!currentBookmark) {
            throw new ctx.errors.NotFoundError('Bookmark not found');
        }

        const updatedBookmark = await ctx.models.bookmarks.update(bookmarkId, user.id, {
            url,
            title,
            pinned: pinned === 'on' || pinned === true,
            hidden: hidden === 'on' || hidden === true,
        });

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(200).json({
                message: `Bookmark ${updatedBookmark.title} updated successfully!`,
                data: updatedBookmark,
            });
            return;
        }

        req.flash('success', `Bookmark ${updatedBookmark.title} updated successfully!`);

        if (updatedBookmark.hidden && !currentBookmark.hidden) {
            req.flash('success', 'Bookmark hidden successfully');
            return res.redirect('/bookmarks');
        }

        return res.redirect('/bookmarks');
    }

    /**
     * @openapi
     * /api/bookmarks/{id}:
     *   delete:
     *     tags:
     *       - Bookmarks
     *     summary: Delete a bookmark
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     responses:
     *       200:
     *         description: Deleted successfully
     *       404:
     *         description: Not found
     */
    router.delete('/api/bookmarks/:id', ctx.middleware.authentication, deleteBookmarkHandler);
    router.post('/bookmarks/:id/delete', ctx.middleware.authentication, deleteBookmarkHandler);
    async function deleteBookmarkHandler(req: Request, res: Response) {
        const deleted = await ctx.models.bookmarks.delete(
            [req.params.id as unknown as number],
            (req.user as User).id,
        );

        if (!deleted) {
            throw new ctx.errors.NotFoundError('Bookmark not found');
        }

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(200).json({ message: 'Bookmark deleted successfully' });
            return;
        }

        req.flash('success', 'Bookmark deleted successfully');
        return res.redirect('/bookmarks');
    }

    /**
     * @openapi
     * /api/bookmarks/delete-bulk:
     *   post:
     *     tags:
     *       - Bookmarks
     *     summary: Delete multiple bookmarks
     *     security:
     *       - BearerAuth: []
     *     requestBody:
     *       required: true
     *       content:
     *         application/json:
     *           schema:
     *             type: object
     *             required:
     *               - id
     *             properties:
     *               id:
     *                 type: array
     *                 items:
     *                   type: integer
     *     responses:
     *       200:
     *         description: Success response
     *       400:
     *         description: Bad request
     */
    router.post('/bookmarks/delete-bulk', ctx.middleware.authentication, bulkDeleteBookmarkHandler);
    router.post(
        '/api/bookmarks/delete-bulk',
        ctx.middleware.authentication,
        bulkDeleteBookmarkHandler,
    );
    async function bulkDeleteBookmarkHandler(req: Request, res: Response) {
        const { id } = req.body;

        if (!id || !Array.isArray(id)) {
            throw new ctx.errors.ValidationError({ id: 'IDs array is required' });
        }

        const bookmarkIds = id.map((id: string) => parseInt(id)).filter((id: number) => !isNaN(id));

        if (bookmarkIds.length === 0) {
            throw new ctx.errors.ValidationError({ id: 'No valid bookmark IDs provided' });
        }

        const user = req.user as User;
        const deletedCount = await ctx.models.bookmarks.delete(bookmarkIds, user.id);

        if (ctx.utils.auth.isApiRequest(req)) {
            res.status(200).json({
                message: `${deletedCount} bookmark${deletedCount !== 1 ? 's' : ''} deleted successfully`,
                data: {
                    deletedCount,
                },
            });
            return;
        }

        req.flash(
            'success',
            `${deletedCount} bookmark${deletedCount !== 1 ? 's' : ''} deleted successfully`,
        );
        return res.redirect('/bookmarks');
    }

    /**
     * @openapi
     * /api/bookmarks/{id}/pin:
     *   post:
     *     tags:
     *       - Bookmarks
     *     summary: Toggle pin status of a bookmark
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     responses:
     *       200:
     *         description: Success response
     *       404:
     *         description: Not found
     */
    router.post('/bookmarks/:id/pin', ctx.middleware.authentication, toggleBookmarkPinHandler);
    router.post('/api/bookmarks/:id/pin', ctx.middleware.authentication, toggleBookmarkPinHandler);
    async function toggleBookmarkPinHandler(req: Request, res: Response) {
        const user = req.user as User;
        const bookmarkId = parseInt(req.params.id as unknown as string);

        const currentBookmark = await ctx.models.bookmarks.read(bookmarkId, user.id);

        if (!currentBookmark) {
            throw new ctx.errors.NotFoundError('Bookmark not found');
        }

        const updatedBookmark = await ctx.models.bookmarks.update(bookmarkId, user.id, {
            pinned: !currentBookmark.pinned,
        });

        if (ctx.utils.auth.isApiRequest(req)) {
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
     * @openapi
     * /api/bookmarks/{id}:
     *   get:
     *     tags:
     *       - Bookmarks
     *     summary: Get a specific bookmark
     *     security:
     *       - BearerAuth: []
     *     parameters:
     *       - in: path
     *         name: id
     *         required: true
     *         schema:
     *           type: integer
     *     responses:
     *       200:
     *         description: Success response
     *       400:
     *         description: Bad request
     *       404:
     *         description: Not found
     *
     */
    router.get(
        '/api/bookmarks/:id',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const bookmark = await ctx.models.bookmarks.read(
                parseInt(req.params.id as unknown as string),
                user.id,
            );

            if (!bookmark) {
                throw new ctx.errors.NotFoundError('Bookmark not found');
            }

            res.status(200).json({
                message: 'Bookmark retrieved successfully',
                data: bookmark,
            });
        },
    );

    router.post(
        '/bookmarks/:id/tabs',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const user = req.user as User;
            const tab_id = parseInt(req.body.tab_id as unknown as string);
            const id = parseInt(req.params.id as unknown as string);

            await ctx.utils.util.addToTabs(user.id, tab_id, 'bookmarks', id);

            if (ctx.utils.auth.isApiRequest(req)) {
                res.status(201).json({ message: 'Tab added successfully' });
                return;
            }

            req.flash('success', 'Tab added!');
            return res.redirect('/bookmarks');
        },
    );

    return router;
}
