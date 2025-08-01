import express, { Request, Response } from 'express';
import { Knex } from 'knex';
import { Bookmarks, User, BookmarkToExport } from '../type';
import {
    expectJson,
    isValidUrl,
    isApiRequest,
    insertBookmark,
    extractPagination,
    highlightSearchTerm,
    checkDuplicateBookmarkUrl,
    getConvertedReadmeMDToHTML,
    generateBookmarkHtmlExport,
    addToTabs,
} from '../utils/util';
import dayjs from '../utils/dayjs';
import { HttpError, NotFoundError, ValidationError } from '../error';

export function createBookmarks(bookmarks: Bookmarks, db: Knex) {
    const router = express.Router();

    router.get('/bookmarks', async (req: Request, res: Response) => {
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
        });

        if (isApiRequest(req)) {
            res.json({ data, pagination, search, sortKey, direction });
            return;
        }

        return res.render('./bookmarks/bookmarks-get.html', {
            user: req.session?.user,
            title: 'Bookmarks',
            path: '/bookmarks',
            layout: '../layouts/auth',
            howToContent: await getConvertedReadmeMDToHTML(),
            data,
            search,
            pagination,
            sortKey,
            direction,
        });
    });

    router.get('/bookmarks/create', (_req: Request, res: Response) => {
        return res.render('./bookmarks/bookmarks-create.html', {
            title: 'Bookmarks / New',
            path: '/bookmarks/create',
            layout: '../layouts/auth.html',
        });
    });

    router.get('/bookmarks/export', async (req: Request, res: Response) => {
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
    });

    router.get('/bookmarks/:id', async (req: Request, res: Response) => {
        const user = req.user as User;
        const bookmark = await bookmarks.read(
            parseInt(req.params.id as unknown as string),
            user.id,
        );

        if (!bookmark) {
            throw new NotFoundError('Bookmark not found');
        }

        if (isApiRequest(req)) {
            res.status(200).json({
                message: 'Bookmark retrieved successfully',
                data: bookmark,
            });
            return;
        }

        throw new NotFoundError('Bookmark page does not exist');
    });

    router.get('/bookmarks/:id/edit', async (req: Request, res: Response) => {
        const bookmark = await bookmarks.read(
            req.params.id as unknown as number,
            (req.user as User).id,
        );

        if (!bookmark) {
            throw new NotFoundError('Bookmark not found');
        }

        return res.render('./bookmarks/bookmarks-edit.html', {
            title: 'Bookmarks / Edit',
            path: '/bookmarks/edit',
            layout: '../layouts/auth.html',
            bookmark,
        });
    });

    router.get('/bookmarks/:id/tabs/create', async (req: Request, res: Response) => {
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

        return res.render('./bookmarks/bookmarks-id-tabs-create.html', {
            title: `Bookmarks / ${id} / Tabs / Create`,
            path: `/bookmarks/${id}/tabs/create`,
            layout: '../layouts/auth.html',
            bookmark,
            tabs,
        });
    });

    router.get('/bookmarks/:id/actions/create', async (req: Request, res: Response) => {
        const bookmark = await db('bookmarks')
            .where({
                id: req.params.id,
                user_id: req.session.user?.id,
            })
            .first();

        return res.render('./bookmarks/bookmarks-id-actions-create.html', {
            title: `Bookmarks / ${req.params.id} / Actions / Create`,
            path: `/bookmarks/${req.params.id}/actions/create`,
            layout: '../layouts/auth.html',
            bookmark,
        });
    });

    router.post('/bookmarks', async (req: Request, res: Response) => {
        const { url, title, pinned } = req.body;

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

        const user = req.user as User;
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
    });

    router.post('/bookmarks/:id/tabs', async (req: Request, res: Response) => {
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
    });

    router.post('/bookmarks/:id/update', updateHandler);
    router.patch('/bookmarks/:id', updateHandler);
    async function updateHandler(req: Request, res: Response) {
        const { url, title, pinned } = req.body;

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

        const updatedBookmark = await bookmarks.update(
            req.params.id as unknown as number,
            (req.user as User).id,
            {
                url,
                title,
                pinned: pinned === 'on' || pinned === true,
            },
        );

        if (isApiRequest(req)) {
            res.status(200).json({
                message: `Bookmark ${updatedBookmark.title} updated successfully!`,
            });
            return;
        }

        req.flash('success', `Bookmark ${updatedBookmark.title} updated successfully!`);
        return res.redirect('/bookmarks');
    }

    router.post('/bookmarks/:id/pin', async (req: Request, res: Response) => {
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
    });

    router.post('/bookmarks/:id/delete', deleteHandler);
    router.delete('/bookmarks/:id', deleteHandler);
    async function deleteHandler(req: Request, res: Response) {
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

    return router;
}
