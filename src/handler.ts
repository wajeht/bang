import {
    Api,
    User,
    Notes,
    Search,
    Actions,
    Bookmarks,
    ApiKeyPayload,
    BookmarkToExport,
} from './type';
import {
    bookmark,
    magicLink,
    expectJson,
    isApiRequest,
    extractPagination,
    sendMagicLinkEmailQueue,
    isOnlyLettersAndNumbers,
    getConvertedReadmeMDToHTML,
    convertMarkdownToPlainText,
    insertBookmarkQueue as InsertBookmarkQueue,
} from './util';
import { Knex } from 'knex';
import { db } from './db/db';
import { marked } from 'marked';
import { logger } from './logger';
import { config } from './config';
import { validateRequestMiddleware } from './middleware';
import { actions, bookmarks, notes } from './repository';
import { Request, Response, NextFunction } from 'express';
import { body, validationResult } from 'express-validator';
import { actionTypes, defaultSearchProviders } from './constant';
import { HttpError, NotFoundError, ValidationError } from './error';

// GET /healthz
export function getHealthzHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        try {
            await db.raw('SELECT 1');

            if (expectJson(req)) {
                res.status(200).json({ status: 'ok', database: 'connected' });
                return;
            }

            res.setHeader('Content-Type', 'text/html').status(200).send('<p>ok</p>');
        } catch (_error) {
            if (expectJson(req)) {
                res.status(503).json({
                    status: 'error',
                    database: 'disconnected',
                    message: 'Database connection failed',
                });
                return;
            }

            res.setHeader('Content-Type', 'text/html')
                .status(503)
                .send('<p>error: database connection failed</p>');
        }
    };
}

// GET /terms-of-service
export function getTermsOfServicePageHandler() {
    return (_req: Request, res: Response) => {
        return res.render('terms-of-service.html', {
            path: '/terms-of-service',
            title: 'Terms of Service',
        });
    };
}

// GET /privacy-policy
export function getPrivacyPolicyPageHandler() {
    return (_req: Request, res: Response) => {
        return res.render('privacy-policy.html', {
            path: '/privacy-policy',
            title: 'Privacy Policy',
        });
    };
}

// GET /how-to
export function getHowToPageHandler() {
    return async (_req: Request, res: Response) => {
        return res.render('how-to.html', {
            path: '/how-to',
            title: 'How To',
            howToContent: await getConvertedReadmeMDToHTML(),
        });
    };
}

// GET /
export function getHomePageAndSearchHandler(search: Search) {
    return async (req: Request, res: Response) => {
        const query = req.query.q?.toString().trim() || '';
        const user = req.session.user as User;

        if (!query) {
            return res.render('home.html', {
                path: '/',
                title: 'Search',
            });
        }

        await search({ res, user, query, req });
    };
}

// GET /logout
export function getLogoutHandler() {
    return (req: Request, res: Response) => {
        if ((req.session && req.session.user) || req.user) {
            req.session.user = null;
            req.user = undefined;
            req.session.destroy((error) => {
                if (error) {
                    throw new HttpError(500, error.message, req);
                }
            });
        }

        return res.redirect(`/?toast=${encodeURIComponent('✌️ see ya!')}`);
    };
}

// POST /search
export function postSearchHandler(search: Search) {
    return async (req: Request, res: Response) => {
        const query = req.body.q?.toString().trim() || '';
        const user = req.session.user as User;

        await search({ res, user, query, req });
    };
}

// GET /actions/:id or GET /api/actions/:id
export function getActionHandler(actions: Actions) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const action = await actions.read(parseInt(req.params.id as unknown as string), user.id);

        if (!action) {
            throw new NotFoundError('Action not found', req);
        }

        if (isApiRequest(req)) {
            res.status(200).json({
                message: 'action retrieved successfully',
                data: action,
            });
            return;
        }

        throw new NotFoundError('Action page does not exist');
    };
}

// GET /actions or /api/actions
export function getActionsHandler(actions: Actions) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const { perPage, page, search, sortKey, direction } = extractPagination(req, 'actions');

        const { data, pagination } = await actions.all({
            user,
            perPage,
            page,
            search,
            sortKey,
            direction,
        });

        if (isApiRequest(req)) {
            res.json({ data, pagination, search, sortKey, direction });
            return;
        }

        return res.render('actions.html', {
            user: req.session?.user,
            path: '/actions',
            title: 'Actions',
            layout: '../layouts/auth.html',
            howToContent: await getConvertedReadmeMDToHTML(),
            data,
            pagination,
            search,
            sortKey,
            direction,
        });
    };
}

// POST /actions or POST /api/actions
export const postActionHandler = {
    validator: validateRequestMiddleware([
        body('url')
            .notEmpty()
            .withMessage('URL is required')
            .isURL()
            .withMessage('Invalid URL format'),
        body('name').notEmpty().withMessage('Name is required').trim(),
        body('actionType')
            .notEmpty()
            .withMessage('Action type is required')
            .isIn(actionTypes)
            .withMessage('Invalid action type'),
        body('trigger')
            .notEmpty()
            .withMessage('Trigger is required')
            .custom(async (trigger, { req }) => {
                const formattedTrigger = trigger.startsWith('!') ? trigger : `!${trigger}`;

                if (!isOnlyLettersAndNumbers(trigger.slice(1))) {
                    throw new ValidationError(
                        'Trigger can only contain letters and numbers',
                        req as Request,
                    );
                }

                const existingBang = await db('bangs')
                    .where({
                        trigger: formattedTrigger,
                        user_id: req.user.id,
                    })
                    .first();

                if (existingBang) {
                    throw new ValidationError('This trigger already exists', req as Request);
                }

                return true;
            }),
    ]),
    handler: function (actions: Actions) {
        return async (req: Request, res: Response) => {
            const { trigger, url, actionType, name } = req.body;

            const formattedTrigger: string = trigger.startsWith('!') ? trigger : `!${trigger}`;

            await actions.create({
                name: name.trim(),
                trigger: formattedTrigger.toLowerCase(),
                url,
                actionType,
                user_id: (req.user as User).id,
            });

            if (isApiRequest(req)) {
                res.status(201).json({
                    message: `Action ${formattedTrigger} created successfully!`,
                });
                return;
            }

            req.flash('success', `Action ${formattedTrigger} created successfully!`);
            return res.redirect('/actions');
        };
    },
};

// GET /actions/create
export function getActionCreatePageHandler() {
    return (_req: Request, res: Response) => {
        return res.render('actions-create.html', {
            title: 'Actions / New',
            path: '/actions/create',
            layout: '../layouts/auth.html',
            actionTypes,
        });
    };
}

// POST /actions/:id/delete or DELETE /api/actions/:id
export function deleteActionHandler(actions: Actions) {
    return async (req: Request, res: Response) => {
        const deleted = await actions.delete(
            req.params.id as unknown as number,
            (req.user as User).id,
        );

        if (!deleted) {
            throw new NotFoundError('Action not found', req);
        }

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'Action deleted successfully' });
            return;
        }

        req.flash('success', 'Action deleted successfully');
        return res.redirect('/actions');
    };
}

// GET /actions/:id/edit
export function getEditActionPageHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const action = await db
            .select('bangs.*', 'action_types.name as action_type')
            .from('bangs')
            .where({
                'bangs.id': req.params.id,
                'bangs.user_id': (req.user as User).id,
            })
            .join('action_types', 'bangs.action_type_id', 'action_types.id')
            .first();

        if (!action) {
            throw new NotFoundError('Action not found', req);
        }

        return res.render('actions-edit.html', {
            title: 'Actions / Edit',
            path: '/actions/edit',
            layout: '../layouts/auth.html',
            action,
        });
    };
}

// POST /actions/:id/update or PATCH /api/actions/:id
export const updateActionHandler = {
    validator: validateRequestMiddleware([
        body('url')
            .notEmpty()
            .withMessage('URL is required')
            .isURL()
            .withMessage('Invalid URL format'),
        body('name').notEmpty().withMessage('Name is required').trim(),
        body('actionType')
            .notEmpty()
            .withMessage('Action type is required')
            .isIn(actionTypes)
            .withMessage('Invalid action type'),
        body('trigger')
            .notEmpty()
            .withMessage('Trigger is required')
            .custom(async (trigger, { req }) => {
                const formattedTrigger = trigger.startsWith('!') ? trigger : `!${trigger}`;

                if (!isOnlyLettersAndNumbers(trigger.slice(1))) {
                    throw new ValidationError(
                        'Trigger can only contain letters and numbers',
                        req as Request,
                    );
                }

                const existingBang = await db('bangs')
                    .where({
                        trigger: formattedTrigger,
                        user_id: req.user!.id,
                    })
                    .whereNot('id', req.params?.id)
                    .first();

                if (existingBang) {
                    throw new ValidationError('This trigger already exists', req as Request);
                }

                return true;
            }),
    ]),
    handler: function (actions: Actions) {
        return async (req: Request, res: Response) => {
            const { trigger, url, actionType, name } = req.body;
            const formattedTrigger = trigger.startsWith('!') ? trigger : `!${trigger}`;

            const updatedAction = await actions.update(
                req.params.id as unknown as number,
                (req.user as User).id,
                {
                    trigger: formattedTrigger,
                    name: name.trim(),
                    url,
                    actionType,
                },
            );

            if (isApiRequest(req)) {
                res.status(200).json({
                    message: `Action ${updatedAction.trigger} updated successfully!`,
                });
                return;
            }

            req.flash('success', `Action ${updatedAction.trigger} updated successfully!`);
            return res.redirect('/actions');
        };
    },
};

// GET /bookmarks/create
export function getBookmarkCreatePageHandler() {
    return (_req: Request, res: Response) => {
        return res.render('bookmarks-create.html', {
            title: 'Bookmarks / New',
            path: '/bookmarks/create',
            layout: '../layouts/auth.html',
        });
    };
}

// GET /bookmarks/:id or GET /api/bookmarks/:id
export function getBookmarkHandler(bookmarks: Bookmarks) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const bookmark = await bookmarks.read(
            parseInt(req.params.id as unknown as string),
            user.id,
        );

        if (!bookmark) {
            throw new NotFoundError('Bookmark not found', req);
        }

        if (isApiRequest(req)) {
            res.status(200).json({
                message: 'Bookmark retrieved successfully',
                data: bookmark,
            });
            return;
        }

        throw new NotFoundError('Bookmark page does not exist');
    };
}

// GET /bookmarks or GET /api/bookmarks
export function getBookmarksHandler(bookmarks: Bookmarks) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const { perPage, page, search, sortKey, direction } = extractPagination(req, 'bookmarks');

        const { data, pagination } = await bookmarks.all({
            user,
            perPage,
            page,
            search,
            sortKey,
            direction,
        });

        if (isApiRequest(req)) {
            res.json({ data, pagination, search, sortKey, direction });
            return;
        }

        return res.render('bookmarks.html', {
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
    };
}

// POST /bookmarks/:id/delete or DELETE /api/bookmarks/:id
export function deleteBookmarkHandler(bookmarks: Bookmarks) {
    return async (req: Request, res: Response) => {
        const deleted = await bookmarks.delete(
            req.params.id as unknown as number,
            (req.user as User).id,
        );

        if (!deleted) {
            throw new NotFoundError('Bookmark not found', req);
        }

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'Bookmark deleted successfully' });
            return;
        }

        req.flash('success', 'Bookmark deleted successfully');
        return res.redirect('/bookmarks');
    };
}

// GET /bookmarks/:id/edit
export function getEditBookmarkPageHandler(bookmarks: Bookmarks) {
    return async (req: Request, res: Response) => {
        const bookmark = await bookmarks.read(
            req.params.id as unknown as number,
            (req.user as User).id,
        );

        if (!bookmark) {
            throw new NotFoundError('Bookmark not found', req);
        }

        return res.render('bookmarks-edit.html', {
            title: 'Bookmarks / Edit',
            path: '/bookmarks/edit',
            layout: '../layouts/auth.html',
            bookmark,
        });
    };
}

// GET /bookmarks/:id/actions/create
export function getBookmarkActionCreatePageHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const bookmark = await db('bookmarks')
            .where({
                id: req.params.id,
                user_id: req.session.user?.id,
            })
            .first();

        return res.render('bookmarks-id-actions-create.html', {
            title: `Bookmarks / ${req.params.id} / Actions / Create`,
            path: `/bookmarks/${req.params.id}/actions/create`,
            layout: '../layouts/auth.html',
            bookmark,
        });
    };
}

// POST /bookmarks/:id/update or PATCH /api/bookmarks/:id
export const updateBookmarkHandler = {
    validator: validateRequestMiddleware([
        body('url')
            .notEmpty()
            .withMessage('URL is required')
            .isURL()
            .withMessage('Invalid URL format'),
        body('title').notEmpty().withMessage('Title is required').trim(),
    ]),
    handler: function (bookmarks: Bookmarks) {
        return async (req: Request, res: Response) => {
            const { url, title } = req.body;

            const updatedBookmark = await bookmarks.update(
                req.params.id as unknown as number,
                (req.user as User).id,
                {
                    url,
                    title,
                },
            );

            req.flash('success', `Bookmark ${updatedBookmark.title} updated successfully!`);
            return res.redirect('/bookmarks');
        };
    },
};

// POST /bookmarks or POST /api/bookmarks
export const postBookmarkHandler = {
    validator: validateRequestMiddleware([
        body('url')
            .notEmpty()
            .withMessage('URL is required')
            .isURL()
            .withMessage('Invalid URL format'),
        body('title').optional().trim(),
    ]),
    handler: function (insertBookmarkQueue: typeof InsertBookmarkQueue) {
        return async (req: Request, res: Response) => {
            const { url, title } = req.body;

            void insertBookmarkQueue.push({ url, userId: (req.user as User).id, title, req });

            if (isApiRequest(req)) {
                res.status(201).json({ message: `Bookmark ${title} created successfully!` });
                return;
            }

            req.flash('success', `Bookmark ${title} created successfully!`);
            return res.redirect('/bookmarks');
        };
    },
};

// GET /bookmarks/export
export function getExportBookmarksHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const bookmarks = (await db
            .select('url', 'title', db.raw("strftime('%s', created_at) as add_date"))
            .from('bookmarks')
            .where({ user_id: req.session.user?.id })) as BookmarkToExport[];

        if (!bookmarks.length) {
            req.flash('info', 'no bookmarks to export yet.');
            return res.redirect('/bookmarks');
        }

        res.setHeader(
            'Content-Disposition',
            `attachment; filename=bookmarks-${new Date().toISOString().split('T')[0]}.html`,
        )
            .setHeader('Content-Type', 'text/html; charset=UTF-8')
            .send(bookmark.createDocument(bookmarks));
    };
}

// GET /settings
export function getSettingsPageHandler() {
    return (_req: Request, res: Response) => {
        return res.redirect('/settings/account');
    };
}

// GET /settings/account
export function getSettingsAccountPageHandler() {
    return (req: Request, res: Response) => {
        return res.render('settings-account.html', {
            user: req.session?.user,
            title: 'Settings Account',
            path: '/settings/account',
            layout: '../layouts/settings.html',
            defaultSearchProviders: Object.keys(defaultSearchProviders),
        });
    };
}

// POST /settings/create-api-key
export function postSettingsCreateApiKeyHandler(db: Knex, api: Api) {
    return async (req: Request, res: Response) => {
        const user = await db('users').where({ id: req.session.user?.id }).first();

        if (!user) {
            throw new NotFoundError('User not found', req);
        }

        const newKeyVersion = (user.api_key_version || 0) + 1;

        const payload: ApiKeyPayload = { userId: user.id, apiKeyVersion: newKeyVersion };

        await db('users')
            .where({ id: req.session?.user?.id })
            .update({
                api_key: await api.generate(payload),
                api_key_version: newKeyVersion,
                api_key_created_at: db.fn.now(),
            });

        req.flash('success', '📱 api key created');
        return res.redirect(`/settings/account`);
    };
}

// POST /settings/account
export const postSettingsAccountHandler = {
    validator: validateRequestMiddleware([
        body('username')
            .notEmpty()
            .custom(async (username, { req }) => {
                const existingUser = await db
                    .select('*')
                    .from('users')
                    .where('username', username)
                    .whereNot('id', req.session?.user?.id)
                    .first();

                if (existingUser) {
                    throw new ValidationError('Username is already taken', req as Request);
                }

                return true;
            }),
        body('email')
            .notEmpty()
            .isEmail()
            .custom(async (email, { req }) => {
                const existingUser = await db
                    .select('*')
                    .from('users')
                    .where('email', email)
                    .whereNot('id', req.session?.user?.id)
                    .first();

                if (existingUser) {
                    throw new ValidationError('Email is already in use', req as Request);
                }

                return true;
            }),
        body('default_search_provider')
            .notEmpty()
            .isIn(Object.keys(defaultSearchProviders))
            .withMessage('Invalid search provider selected'),
        body('autocomplete_search_on_homepage').custom((value) => {
            if (value === undefined) {
                value = false;
            }

            if (value === 'on') {
                value = true;
            }

            return true;
        }),
    ]),
    handler: function (db: Knex) {
        return async (req: Request, res: Response) => {
            const { email, username, default_search_provider } = req.body;
            const autocomplete_search_on_homepage =
                req.body.autocomplete_search_on_homepage === 'on';

            await db('users')
                .update({
                    email,
                    username,
                    default_search_provider,
                    autocomplete_search_on_homepage,
                })
                .where({ id: (req.user as User).id });

            req.flash('success', '🔄 updated!');
            return res.redirect('/settings/account');
        };
    },
};

// GET /settings/data
export function getSettingsDataPageHandler() {
    return (req: Request, res: Response) => {
        return res.render('settings-data.html', {
            user: req.session?.user,
            title: 'Settings Data',
            path: '/settings/data',
            layout: '../layouts/settings.html',
        });
    };
}

// POST /settings/data/export
export const postExportDataHandler = {
    validator: validateRequestMiddleware([
        body('options').custom((value, { req }) => {
            if (value === undefined) {
                throw new ValidationError(
                    'Please select at least one data type to export',
                    req as Request,
                );
            }
            return true;
        }),
    ]),
    handler: function (db: Knex, log: typeof logger) {
        return async (req: Request, res: Response) => {
            const userId = (req.user as User).id;
            const includeBookmarks = req.body.options.includes('bookmarks');
            const includeActions = req.body.options.includes('actions');
            const includeNotes = req.body.options.includes('notes');
            const exportData: {
                exported_at: string;
                version: string;
                bookmarks?: Record<string, unknown>[];
                actions?: Record<string, unknown>[];
                notes?: Record<string, unknown>[];
            } = {
                exported_at: new Date().toISOString(),
                version: '1.0',
            };

            const fetchBookmarks = () =>
                includeBookmarks
                    ? db('bookmarks').where('user_id', userId).select('title', 'url', 'created_at')
                    : Promise.resolve([]);

            const fetchActions = () =>
                includeActions
                    ? db
                          .select(
                              'bangs.trigger',
                              'bangs.name',
                              'bangs.url',
                              'action_types.name as action_type',
                              'bangs.created_at',
                          )
                          .from('bangs')
                          .join('action_types', 'bangs.action_type_id', 'action_types.id')
                          .where('bangs.user_id', userId)
                    : Promise.resolve([]);

            const fetchNotes = () =>
                includeNotes
                    ? db('notes').where('user_id', userId).select('title', 'content', 'created_at')
                    : Promise.resolve([]);

            const [bookmarksResult, actionsResult, notesResult] = await Promise.allSettled([
                fetchBookmarks(),
                fetchActions(),
                fetchNotes(),
            ]);

            if (includeBookmarks) {
                if (bookmarksResult.status === 'fulfilled') {
                    exportData.bookmarks = bookmarksResult.value;
                } else {
                    log.error('Failed to fetch bookmarks: %o', bookmarksResult.reason);
                }
            }

            if (includeActions) {
                if (actionsResult.status === 'fulfilled') {
                    exportData.actions = actionsResult.value;
                } else {
                    log.error('Failed to fetch actions: %o', actionsResult.reason);
                }
            }

            if (includeNotes) {
                if (notesResult.status === 'fulfilled') {
                    exportData.notes = notesResult.value;
                } else {
                    log.error('Failed to fetch notes: %o', notesResult.reason);
                }
            }

            res.setHeader(
                'Content-Disposition',
                `attachment; filename=bang-data-export-${exportData.exported_at}.json`,
            )
                .setHeader('Content-Type', 'application/json')
                .send(JSON.stringify(exportData, null, 2));
        };
    },
};

// POST /settings/data/import
export const postImportDataHandler = {
    validator: validateRequestMiddleware([
        body('config')
            .notEmpty()
            .withMessage('config must not be empty')
            .custom((value, { req }) => {
                try {
                    const parsed = JSON.parse(value);

                    if (!parsed.version || parsed.version !== '1.0') {
                        throw new ValidationError('Config version must be 1.0', req as Request);
                    }
                } catch (_error) {
                    throw new ValidationError('Invalid JSON format', req as Request);
                }

                return true;
            }),
    ]),
    handler: function (db: Knex) {
        return async (req: Request, res: Response) => {
            const userId = req.session.user?.id;
            const importData = JSON.parse(req.body.config);

            try {
                await db.transaction(async (trx) => {
                    if (importData.bookmarks?.length > 0) {
                        const bookmarks = importData.bookmarks.map(
                            (bookmark: { title: string; url: string }) => ({
                                user_id: userId,
                                title: bookmark.title,
                                url: bookmark.url,
                                created_at: db.fn.now(),
                            }),
                        );
                        await trx('bookmarks').insert(bookmarks);
                    }

                    if (importData.actions?.length > 0) {
                        for (const action of importData.actions) {
                            const actionType = await trx('action_types')
                                .where('name', action.action_type)
                                .first();

                            if (actionType) {
                                await trx('bangs').insert({
                                    user_id: userId,
                                    trigger: action.trigger,
                                    name: action.name,
                                    url: action.url,
                                    action_type_id: actionType.id,
                                    created_at: db.fn.now(),
                                });
                            }
                        }
                    }

                    if (importData.notes?.length > 0) {
                        const notes = importData.notes.map(
                            (note: { title: string; content: string }) => ({
                                user_id: userId,
                                title: note.title,
                                content: note.content,
                                created_at: db.fn.now(),
                            }),
                        );

                        await trx('notes').insert(notes);
                    }
                });

                req.flash('success', 'Data imported successfully!');
            } catch (_error) {
                req.flash('error', 'Failed to import data. Please check the format and try again.');
            }

            return res.redirect('/settings/data');
        };
    },
};

// GET /settings/danger-zone
export function getSettingsDangerZonePageHandler() {
    return (req: Request, res: Response) => {
        return res.render('settings-danger-zone.html', {
            title: 'Settings Danger Zone',
            user: req.session?.user,
            path: '/settings/danger-zone',
            layout: '../layouts/settings.html',
        });
    };
}

// POST /settings/danger-zone/delete
export function postDeleteSettingsDangerZoneHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        await db('users').where({ id: req.session.user?.id }).delete();

        if ((req.session && req.session.user) || req.user) {
            req.session.user = null;
            req.user = undefined;
            req.session.destroy((error) => {
                if (error) {
                    throw new HttpError(error);
                }
            });
        }

        return res.redirect('/?toast=🗑️ deleted');
    };
}

// GET /settings/data/export
export async function getExportAllDataHandler(req: Request, res: Response) {
    const userId = (req.user as User).id;

    const [user, bangs, bookmarks, notes] = await Promise.all([
        db('users')
            .where('id', userId)
            .select('username', 'email', 'default_search_provider', 'created_at')
            .first(),
        db('bangs')
            .join('action_types', 'bangs.action_type_id', 'action_types.id')
            .where('bangs.user_id', userId)
            .select(
                'bangs.trigger',
                'bangs.name',
                'bangs.url',
                'action_types.name as action_type',
                'bangs.created_at',
            ),
        db('bookmarks').where('user_id', userId).select('title', 'url', 'created_at'),
        db('notes').where('user_id', userId).select('title', 'content', 'created_at'),
    ]);

    const exportData = {
        user,
        bangs,
        bookmarks,
        notes,
        exported_at: new Date().toISOString(),
    };

    const currentDate = new Date().toISOString().split('T')[0];
    const filename = `bang-data-export-${currentDate}.json`;

    return res
        .setHeader('Content-Disposition', `attachment; filename=${filename}`)
        .setHeader('Content-Type', 'application/json')
        .send(JSON.stringify(exportData, null, 2));
}

// GET /api/collections
export async function getCollectionsHandler(req: Request, res: Response) {
    const user = req.user as User;
    const actionsParams = extractPagination(req, 'actions');
    const bookmarksParams = extractPagination(req, 'bookmarks');
    const notesParams = extractPagination(req, 'notes');

    const [actionsResult, bookmarksResult, notesResult] = await Promise.all([
        actions.all({
            user,
            perPage: actionsParams.perPage,
            page: actionsParams.page,
            search: actionsParams.search,
            sortKey: actionsParams.sortKey,
            direction: actionsParams.direction,
        }),
        bookmarks.all({
            user,
            perPage: bookmarksParams.perPage,
            page: bookmarksParams.page,
            search: bookmarksParams.search,
            sortKey: bookmarksParams.sortKey,
            direction: bookmarksParams.direction,
        }),
        notes.all({
            user,
            perPage: notesParams.perPage,
            page: notesParams.page,
            search: notesParams.search,
            sortKey: notesParams.sortKey,
            direction: notesParams.direction,
        }),
    ]);

    res.json({
        actions: actionsResult,
        bookmarks: bookmarksResult,
        notes: notesResult,
        search: actionsParams.search, // or bookmarksParams.search, the same search for both
        sortKey: actionsParams.sortKey, // or bookmarksParams.sortKey, the same sortKey for both
        direction: actionsParams.direction, // or bookmarksParams.direction, the same direction for both
    });
}

// POST /settings/display
export const postSettingsDisplayHandler = {
    validator: validateRequestMiddleware([
        body('column_preferences').custom((value, { req }) => {
            if (value === undefined) {
                throw new ValidationError('Column preferences are required', req as Request);
            }

            if (typeof value !== 'object') {
                throw new ValidationError('Column preferences must be an object', req as Request);
            }

            // bookmarks
            if (typeof value.bookmarks !== 'object') {
                throw new ValidationError('Bookmarks must be an object', req as Request);
            }

            value.bookmarks.title = value.bookmarks.title === 'on';
            value.bookmarks.url = value.bookmarks.url === 'on';
            value.bookmarks.created_at = value.bookmarks.created_at === 'on';

            value.bookmarks.default_per_page = parseInt(value.bookmarks.default_per_page, 10);

            if (isNaN(value.bookmarks.default_per_page) || value.bookmarks.default_per_page < 1) {
                throw new ValidationError(
                    'Bookmarks per page must be greater than 0',
                    req as Request,
                );
            }

            if (!value.bookmarks.title && !value.bookmarks.url && !value.bookmarks.created_at) {
                throw new ValidationError(
                    'At least one bookmark column must be enabled',
                    req as Request,
                );
            }

            // actions
            if (typeof value.actions !== 'object') {
                throw new ValidationError('Actions must be an object', req as Request);
            }

            value.actions.name = value.actions.name === 'on';
            value.actions.trigger = value.actions.trigger === 'on';
            value.actions.url = value.actions.url === 'on';
            value.actions.action_type = value.actions.action_type === 'on';
            value.actions.created_at = value.actions.created_at === 'on';
            value.actions.last_read_at = value.actions.last_read_at === 'on';

            value.actions.default_per_page = parseInt(value.actions.default_per_page, 10);

            if (isNaN(value.actions.default_per_page) || value.actions.default_per_page < 1) {
                throw new ValidationError(
                    'Actions per page must be greater than 0',
                    req as Request,
                );
            }

            if (
                !value.actions.name &&
                !value.actions.trigger &&
                !value.actions.url &&
                !value.actions.action_type &&
                !value.actions.last_read_at &&
                !value.actions.created_at
            ) {
                throw new ValidationError(
                    'At least one action column must be enabled',
                    req as Request,
                );
            }

            // notes
            if (typeof value.notes !== 'object') {
                throw new ValidationError('Notes must be an object', req as Request);
            }

            value.notes.title = value.notes.title === 'on';
            value.notes.content = value.notes.content === 'on';
            value.notes.created_at = value.notes.created_at === 'on';

            // Handle view_type preference
            if (value.notes.view_type && !['card', 'table'].includes(value.notes.view_type)) {
                value.notes.view_type = 'table'; // Default to table if invalid
            }

            if (!value.notes.title && !value.notes.content) {
                throw new ValidationError(
                    'At least one note column must be enabled',
                    req as Request,
                );
            }

            value.notes.default_per_page = parseInt(value.notes.default_per_page, 10);

            if (isNaN(value.notes.default_per_page) || value.notes.default_per_page < 1) {
                throw new ValidationError('Notes per page must be greater than 0', req as Request);
            }

            // Preserve the view_type if it's not in the form submission
            if (!value.notes.view_type && req.session?.user?.column_preferences?.notes?.view_type) {
                value.notes.view_type = req.session.user.column_preferences.notes.view_type;
            }

            return true;
        }),
    ]),
    handler: function (db: Knex) {
        return async (req: Request, res: Response) => {
            const user = req.user as User;
            const { column_preferences, path } = req.body;

            await db('users')
                .where('id', user.id)
                .update({
                    column_preferences: JSON.stringify(column_preferences),
                });

            req.session.user!.column_preferences = column_preferences;

            req.flash('success', 'Column settings updated');

            return res.redirect(path);
        };
    },
};

// GET /notes or /api/notes
export function getNotesHandler(notes: Notes) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const { perPage, page, search, sortKey, direction } = extractPagination(req, 'notes');

        const { data, pagination } = await notes.all({
            user,
            perPage,
            page,
            search,
            sortKey,
            direction,
        });

        if (isApiRequest(req)) {
            res.json({ data, pagination, search, sortKey, direction });
            return;
        }

        const markdownRemovedData = await Promise.all(
            data.map(async (d: any) => {
                return {
                    ...d,
                    content: await convertMarkdownToPlainText(d.content),
                };
            }),
        );

        return res.render('notes.html', {
            user: req.session?.user,
            title: 'Notes',
            path: '/notes',
            layout: '../layouts/auth',
            howToContent: await getConvertedReadmeMDToHTML(),
            data: markdownRemovedData,
            search,
            pagination,
            sortKey,
            direction,
        });
    };
}

// GET /notes/create
export function getNoteCreatePageHandler() {
    return (_req: Request, res: Response) => {
        return res.render('notes-create.html', {
            title: 'Notes / Create',
            path: '/notes/create',
            layout: '../layouts/auth',
        });
    };
}

// POST /notes or /api/notes
export const postNoteHandler = {
    validator: validateRequestMiddleware([
        body('title')
            .trim()
            .notEmpty()
            .withMessage('Title is required')
            .isLength({ max: 255 })
            .withMessage('Title must be less than 255 characters'),
        body('content').trim().notEmpty().withMessage('Content is required'),
    ]),
    handler: function (notes: Notes) {
        return async (req: Request, res: Response) => {
            const { title, content } = req.body;
            const user = req.user as User;

            const note = await notes.create({
                user_id: user.id,
                title: title.trim(),
                content: content.trim(),
            });

            if (isApiRequest(req)) {
                res.status(201).json({ message: `Note ${note.title} created successfully!` });
                return;
            }

            req.flash('success', 'Note created successfully');
            return res.redirect('/notes');
        };
    },
};

// GET /notes/:id/edit
export function getEditNotePageHandler(notes: Notes) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const note = await notes.read(parseInt(req.params.id as unknown as string), user.id);

        if (!note) {
            throw new NotFoundError('Note not found', req);
        }

        return res.render('notes-edit.html', {
            title: 'Notes / Edit',
            path: '/notes/edit',
            layout: '../layouts/auth',
            note,
        });
    };
}

// POST /notes/:id/update or PATCH /api/notes/:id
export const updateNoteHandler = {
    validator: validateRequestMiddleware([
        body('title')
            .trim()
            .notEmpty()
            .withMessage('Title is required')
            .isLength({ max: 255 })
            .withMessage('Title must be less than 255 characters'),
        body('content').trim().notEmpty().withMessage('Content is required'),
    ]),
    handler: function (notes: Notes) {
        return async (req: Request, res: Response) => {
            const { title, content } = req.body;
            const user = req.user as User;

            const updatedNote = await notes.update(
                parseInt(req.params.id as unknown as string),
                user.id,
                {
                    title: title.trim(),
                    content: content.trim(),
                },
            );

            if (isApiRequest(req)) {
                res.status(200).json({ message: 'note updated successfully' });
                return;
            }

            req.flash('success', `Note ${updatedNote.title} updated successfully`);
            return res.redirect(`/notes/${updatedNote.id}`);
        };
    },
};

// GET /notes/:id or GET /api/notes/:id
export function getNoteHandler(notes: Notes, markdownParser: typeof marked, log: typeof logger) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        let note = await notes.read(parseInt(req.params.id as unknown as string), user.id);

        if (!note) {
            throw new NotFoundError('Note not found', req);
        }

        let content: string = '';

        try {
            content = markdownParser(note.content) as string;
        } catch (_error) {
            content = '';
            log.error(`cannot parse content into markdown`, { error: _error });
        }

        note = {
            ...note,
            content,
        };

        if (isApiRequest(req)) {
            res.status(200).json({
                message: 'note retrieved successfully',
                data: note,
            });
            return;
        }

        return res.render('notes-id-get.html', {
            title: `Notes / ${note.title}`,
            path: `/notes/${note.id}`,
            layout: '../layouts/auth',
            note,
        });
    };
}

// POST /notes/:id/delete or DELETE /api/notes/:id
export function deleteNoteHandler(notes: Notes) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const deleted = await notes.delete(parseInt(req.params.id as unknown as string), user.id);

        if (!deleted) {
            throw new NotFoundError('Not not found', req);
        }

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'note deleted successfully' });
            return;
        }

        req.flash('success', 'Note deleted successfully');
        return res.redirect('/notes');
    };
}

// GET /api/notes
export function getNotesByApiHandler(notes: Notes) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const { perPage, page, search, sortKey, direction } = extractPagination(req, 'notes');

        const { data, pagination } = await notes.all({
            user,
            perPage,
            page,
            search,
            sortKey,
            direction,
        });

        return res.json({ data, pagination });
    };
}

// POST /api/notes
export const createNoteByApiHandler = [
    validateRequestMiddleware([
        body('title')
            .trim()
            .notEmpty()
            .withMessage('Title is required')
            .isLength({ max: 255 })
            .withMessage('Title must be less than 255 characters'),
        body('content').trim().notEmpty().withMessage('Content is required'),
    ]),
    async (req: Request, res: Response) => {
        const { title, content } = req.body;
        const user = req.user as User;

        const note = await notes.create({
            user_id: user.id,
            title: title.trim(),
            content: content.trim(),
        });

        return res.status(201).json(note);
    },
];

// PUT /api/notes/:id
export const updateNoteByApiHandler = [
    validateRequestMiddleware([
        body('title')
            .trim()
            .notEmpty()
            .withMessage('Title is required')
            .isLength({ max: 255 })
            .withMessage('Title must be less than 255 characters'),
        body('content').trim().notEmpty().withMessage('Content is required'),
    ]),
    async (req: Request, res: Response) => {
        const { title, content } = req.body;
        const user = req.user as User;

        const updatedNote = await notes.update(
            parseInt(req.params.id as unknown as string),
            user.id,
            {
                title: title.trim(),
                content: content.trim(),
            },
        );

        return res.json(updatedNote);
    },
];

// DELETE /api/notes/:id
export function deleteNoteByApiHandler(notes: Notes) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const deletedNote = await notes.delete(
            parseInt(req.params.id as unknown as string),
            user.id,
        );

        return res.json(deletedNote);
    };
}

// POST /admin/users/:id/delete
export function postDeleteAdminUserHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const userId = parseInt(req.params.id as unknown as string);

        if (req.user?.is_admin && req.user?.id === userId) {
            req.flash('info', 'you cannot delete yourself');
            return res.redirect('/admin/users');
        }

        const user = await db('users').where({ id: userId }).delete();

        if (!user) {
            throw new NotFoundError('User not found', req);
        }

        req.flash('success', 'deleted');
        return res.redirect('/admin/users');
    };
}

// GET /admin/users
export function getAdminUsersHandler(db: Knex) {
    return async (req: Request, res: Response) => {
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

        return res.render('admin-users.html', {
            title: 'Admin / Users',
            path: '/admin/users',
            layout: '../layouts/admin.html',
            data,
            pagination,
            search,
            sortKey,
            direction,
        });
    };
}

// POST /login
export const postLoginHandler = {
    validator: async (req: Request, res: Response, next: NextFunction) => {
        await body('email')
            .isEmail()
            .withMessage('Please enter a valid email address')
            .normalizeEmail()
            .run(req);

        const result = validationResult(req) as any;

        req.session.input = req.body;

        if (result.isEmpty()) {
            delete req.session.errors;
            return next();
        }

        const { errors } = result;
        const reshapedErrors: { [key: string]: string } = {};
        for (const error of errors) {
            reshapedErrors[error.path] = error.msg;
        }

        req.session.errors = reshapedErrors;

        return res.redirect('/?login=true');
    },
    handler: function () {
        return async (req: Request, res: Response) => {
            const { email } = req.body;

            let user = await db('users').where({ email }).first();

            if (!user) {
                const username = email.split('@')[0];
                [user] = await db('users')
                    .insert({
                        username,
                        email,
                        is_admin: config.app.adminEmail === email,
                    })
                    .returning('*');
            }

            const token = magicLink.generate({ email });

            void sendMagicLinkEmailQueue.push({ email, token, req });

            req.flash(
                'success',
                `📧 Magic link sent to ${email}! Check your email and click the link to log in.`,
            );
            return res.redirect('/');
        };
    },
};

// GET /auth/magic/:token
export function getMagicLinkHandler() {
    return async (req: Request, res: Response) => {
        const { token } = req.params;

        const decoded = magicLink.verify(token!);

        if (!decoded || !decoded.email) {
            req.flash('error', 'Magic link has expired or is invalid. Please request a new one.');
            return res.redirect('/?login=true');
        }

        const user = await db('users').where({ email: decoded.email }).first();

        if (!user) {
            throw new NotFoundError('User not found', req);
        }

        let columnPreferences = {};
        if (user.column_preferences) {
            try {
                columnPreferences = JSON.parse(user.column_preferences);
            } catch {
                columnPreferences = {};
            }
        }

        const parsedUser = {
            ...user,
            column_preferences: columnPreferences,
        };

        req.user = parsedUser;
        req.session.user = parsedUser;

        const redirectTo = req.session.redirectTo || '/actions';
        delete req.session.redirectTo;
        req.session.save();

        req.flash('success', `🎉 Welcome ${user.username}! You're now logged in.`);
        return res.redirect(redirectTo);
    };
}
