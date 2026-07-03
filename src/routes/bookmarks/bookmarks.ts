import type { AppContext, AppContextContext, AppEnv, BookmarkToExport, User } from '../../type.js';
import { setFlash } from '../middleware.js';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';

export function createBookmarksRouter(ctx: AppContext) {
    const router = new Hono<AppEnv>();

    const bookmarkCreateSchema = z.object({
        url: z
            .string('URL is required')
            .min(1, 'URL is required')
            .refine((value) => ctx.utils.validation.isValidUrl(value), 'Invalid URL format'),
        title: z.string().optional(),
        pinned: z
            .union([z.boolean(), z.literal('on')], 'Pinned must be a boolean or checkbox value')
            .optional(),
        hidden: z
            .union([z.boolean(), z.literal('on')], 'Hidden must be a boolean or checkbox value')
            .optional(),
    });

    const bookmarkUpdateSchema = bookmarkCreateSchema.extend({
        title: z.string('Title is required').min(1, 'Title is required'),
    });

    router.get('/bookmarks', ctx.middleware.authentication, getBookmarksHandler);
    async function getBookmarksHandler(c: AppContextContext) {
        const user = c.get('user') as User;
        const { perPage, page, search, sortKey, direction } =
            ctx.utils.request.extractPaginationParamsFromContext(c, 'bookmarks');

        const { canViewHidden, hasVerifiedPassword } =
            ctx.utils.request.canViewHiddenItemsFromContext(c, user);

        const { data, pagination } = await ctx.models.bookmarks.all({
            user,
            perPage,
            page,
            search,
            sortKey,
            direction,
            excludeHidden: !canViewHidden,
        });

        ctx.utils.html.applyHighlighting(data, ['title', 'url'], search);

        return c.render('bookmarks/bookmarks-index.html', {
            user: c.get('user'),
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

    router.get('/bookmarks/create', ctx.middleware.authentication, async (c) => {
        return c.render('bookmarks/bookmarks-new.html', {
            title: 'Bookmarks / New',
            path: '/bookmarks/create',
            layout: '_layouts/auth.html',
        });
    });

    router.get('/bookmarks/export', ctx.middleware.authentication, async (c) => {
        const userId = c.get('user')?.id;

        if (!userId) {
            throw new ctx.errors.NotFoundError('User not found');
        }

        const bookmarksData = (await ctx.db
            .select('url', 'title', ctx.db.raw("strftime('%s', created_at) as add_date"))
            .from('bookmarks')
            .where({ user_id: userId })) as BookmarkToExport[];

        if (!bookmarksData.length) {
            setFlash(c, 'info', 'no bookmarks to export yet.');
            return c.redirect('/bookmarks');
        }

        const htmlExport = await ctx.utils.util.generateBookmarkHtmlExport(userId);

        c.header(
            'Content-Disposition',
            `attachment; filename=bookmarks-${ctx.utils.date.todayInputValue()}.html`,
        );
        c.header('Content-Type', 'text/html; charset=UTF-8');
        return c.body(htmlExport);
    });

    router.get('/bookmarks/:id/edit', ctx.middleware.authentication, async (c) => {
        const bookmark = await ctx.models.bookmarks.read(
            parseInt(c.req.param('id') ?? '', 10),
            (c.get('user') as User).id,
        );

        if (!bookmark) {
            throw new ctx.errors.NotFoundError('Bookmark not found');
        }

        return c.render('bookmarks/bookmarks-edit.html', {
            title: 'Bookmarks / Edit',
            path: '/bookmarks/edit',
            layout: '_layouts/auth.html',
            bookmark,
        });
    });

    router.get('/bookmarks/:id/tabs/create', ctx.middleware.authentication, async (c) => {
        const id = parseInt(c.req.param('id') ?? '', 10);
        const session = c.get('session');
        const bookmark = await ctx
            .db('bookmarks')
            .where({
                id,
                user_id: session.user?.id,
            })
            .first();

        if (!bookmark) {
            throw new ctx.errors.NotFoundError('Bookmark not found');
        }

        const tabs = await ctx.db('tabs').where({ user_id: session.user?.id });

        return c.render('bookmarks/bookmarks-tabs-new.html', {
            title: `Bookmarks / ${id} / Tabs / Create`,
            path: `/bookmarks/${id}/tabs/create`,
            layout: '_layouts/auth.html',
            bookmark,
            tabs,
        });
    });

    router.get('/bookmarks/:id/actions/create', ctx.middleware.authentication, async (c) => {
        const bookmark = await ctx
            .db('bookmarks')
            .where({
                id: c.req.param('id'),
                user_id: c.get('user')?.id,
            })
            .first();

        const id = c.req.param('id');
        return c.render('bookmarks/bookmarks-actions-new.html', {
            title: `Bookmarks / ${String(id)} / Actions / Create`,
            path: `/bookmarks/${String(id)}/actions/create`,
            layout: '_layouts/auth.html',
            bookmark,
        });
    });

    router.post(
        '/bookmarks',
        ctx.middleware.authentication,
        zValidator('form', bookmarkCreateSchema, (result) => {
            if (!result.success) {
                const errors: Record<string, string> = {};
                for (const issue of result.error.issues) {
                    errors[String(issue.path[0] ?? 'general')] ??= issue.message;
                }
                throw new ctx.errors.ValidationError(errors);
            }
        }),
        async (c) => {
            const { url, title, pinned, hidden } = c.req.valid('form');
            const user = c.get('user') as User;

            if (hidden === 'on' || hidden === true) {
                const dbUser = await ctx.db('users').where({ id: user.id }).first();
                if (!dbUser?.hidden_items_password) {
                    throw new ctx.errors.ValidationError({
                        hidden: 'You must set a global password in settings before hiding items',
                    });
                }
            }
            const existingBookmark = await ctx.utils.util.checkDuplicateBookmarkUrl(
                user.id,
                url,
                title || '',
            );

            if (existingBookmark) {
                throw new ctx.errors.ValidationError({
                    url: `URL already bookmarked as "${existingBookmark.title}". Please use a different URL or update the existing bookmark.`,
                });
            }

            void Promise.resolve().then(async () => {
                try {
                    await ctx.utils.util.insertBookmark({
                        url,
                        userId: user.id,
                        title,
                        pinned: pinned === 'on' || pinned === true,
                        hidden: hidden === 'on' || hidden === true,
                    });
                } catch (error) {
                    ctx.logger.error('Background bookmark insertion failed', {
                        error,
                        url,
                        title,
                    });
                }
            });

            setFlash(c, 'success', `Bookmark ${title} created successfully!`);
            return c.redirect('/bookmarks');
        },
    );

    router.post(
        '/bookmarks/:id/update',
        ctx.middleware.authentication,
        zValidator('form', bookmarkUpdateSchema, (result) => {
            if (!result.success) {
                const errors: Record<string, string> = {};
                for (const issue of result.error.issues) {
                    errors[String(issue.path[0] ?? 'general')] ??= issue.message;
                }
                throw new ctx.errors.ValidationError(errors);
            }
        }),
        async (c) => {
            const { url, title, pinned, hidden } = c.req.valid('form');
            const user = c.get('user') as User;
            const bookmarkId = parseInt(c.req.param('id') ?? '', 10);

            if (hidden === 'on' || hidden === true) {
                const dbUser = await ctx.db('users').where({ id: user.id }).first();
                if (!dbUser?.hidden_items_password) {
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

            setFlash(c, 'success', `Bookmark ${updatedBookmark.title} updated successfully!`);

            if (updatedBookmark.hidden && !currentBookmark.hidden) {
                setFlash(c, 'success', 'Bookmark hidden successfully');
                return c.redirect('/bookmarks');
            }

            return c.redirect('/bookmarks');
        },
    );

    router.post('/bookmarks/:id/delete', ctx.middleware.authentication, deleteBookmarkHandler);
    router.post('/bookmarks/delete', ctx.middleware.authentication, deleteBookmarkHandler);
    async function deleteBookmarkHandler(c: AppContextContext) {
        const user = c.get('user') as User;
        const bookmarkIds = ctx.utils.request.extractIdsForDeleteFromContext(c);
        const deletedCount = await ctx.models.bookmarks.delete(bookmarkIds, user.id);

        if (!deletedCount) {
            throw new ctx.errors.NotFoundError('Bookmark not found');
        }

        setFlash(
            c,
            'success',
            `${deletedCount} bookmark${deletedCount !== 1 ? 's' : ''} deleted successfully`,
        );
        return c.redirect('/bookmarks');
    }

    router.post('/bookmarks/:id/pin', ctx.middleware.authentication, toggleBookmarkPinHandler);
    async function toggleBookmarkPinHandler(c: AppContextContext) {
        const user = c.get('user') as User;
        const bookmarkId = parseInt(c.req.param('id') ?? '', 10);

        const currentBookmark = await ctx.models.bookmarks.read(bookmarkId, user.id);

        if (!currentBookmark) {
            throw new ctx.errors.NotFoundError('Bookmark not found');
        }

        const updatedBookmark = await ctx.models.bookmarks.update(bookmarkId, user.id, {
            pinned: !currentBookmark.pinned,
        });

        setFlash(
            c,
            'success',
            `Bookmark ${updatedBookmark.pinned ? 'pinned' : 'unpinned'} successfully`,
        );
        return c.redirect('/bookmarks');
    }

    router.post('/bookmarks/:id/hide', ctx.middleware.authentication, toggleBookmarkHideHandler);
    async function toggleBookmarkHideHandler(c: AppContextContext) {
        const user = c.get('user') as User;
        const body = c.get('body');
        const bookmarkId = parseInt(c.req.param('id') ?? '', 10);

        const dbUser = await ctx.db('users').where({ id: user.id }).first();
        if (!dbUser?.hidden_items_password) {
            throw new ctx.errors.ValidationError({
                hidden: 'You must set a global password in settings before hiding items',
            });
        }

        const currentBookmark = await ctx.models.bookmarks.read(bookmarkId, user.id);

        if (!currentBookmark) {
            throw new ctx.errors.NotFoundError('Bookmark not found');
        }

        const updatedBookmark = await ctx.models.bookmarks.update(bookmarkId, user.id, {
            hidden: !currentBookmark.hidden,
        });

        setFlash(
            c,
            'success',
            `Bookmark ${updatedBookmark.hidden ? 'hidden' : 'unhidden'} successfully`,
        );
        const showHidden = body.showHidden === 'true';
        return c.redirect('/bookmarks' + (showHidden ? '?hidden=true' : ''));
    }

    router.post('/bookmarks/:id/tabs', ctx.middleware.authentication, async (c) => {
        const user = c.get('user') as User;
        const body = c.get('body');
        const tab_id = parseInt(body.tab_id, 10);
        const id = parseInt(c.req.param('id') ?? '', 10);

        await ctx.utils.util.addToTabs(user.id, tab_id, 'bookmarks', id);

        setFlash(c, 'success', 'Tab added!');
        return c.redirect('/bookmarks');
    });

    const activePrefetches = new Set<number>();

    router.post('/bookmarks/prefetch', ctx.middleware.authentication, async (c) => {
        const user = c.get('user') as User;

        if (activePrefetches.has(user.id)) {
            setFlash(c, 'info', 'Screenshot caching already in progress...');
            return c.redirect('/bookmarks');
        }

        const bookmarks = await ctx
            .db('bookmarks')
            .select('url')
            .where({ user_id: user.id })
            .limit(500);

        const urls = bookmarks.map((b: { url: string }) => b.url).filter(Boolean);

        if (urls.length === 0) {
            setFlash(c, 'info', 'No URLs to cache');
            return c.redirect('/bookmarks');
        }

        activePrefetches.add(user.id);

        void ctx.utils.util
            .prefetchScreenshots(urls)
            .finally(() => activePrefetches.delete(user.id));

        setFlash(c, 'success', `Caching ${urls.length} preview images in background...`);
        return c.redirect('/bookmarks');
    });

    return router;
}
