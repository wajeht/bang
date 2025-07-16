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
    paginate,
    magicLink,
    addToTabs,
    expectJson,
    isValidUrl,
    isApiRequest,
    isValidEmail,
    insertBookmark,
    extractPagination,
    sendMagicLinkEmail,
    sendDataExportEmail,
    normalizeBangTrigger,
    generateUserDataExport,
    isOnlyLettersAndNumbers,
    checkDuplicateBookmarkUrl,
    getConvertedReadmeMDToHTML,
    convertMarkdownToPlainText,
    generateBookmarkHtmlExport,
} from './utils/util';
import { Knex } from 'knex';
import { bangs } from './db/bang';
import { config } from './config';
import type { Bang } from './type';
import { logger } from './utils/logger';
import type { Request, Response } from 'express';
import { db, actions, bookmarks, notes } from './db/db';
import { actionTypes, defaultSearchProviders } from './utils/util';
import { HttpError, NotFoundError, ValidationError } from './error';

// GET /healthz
export function getHealthzHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        await db.raw('SELECT 1');

        if (expectJson(req)) {
            res.status(200).json({ status: 'ok', database: 'connected' });
            return;
        }

        res.setHeader('Content-Type', 'text/html').status(200).send('<p>ok</p>');
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
        const user = req.session.user as User | undefined;

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

        return res.render('./actions/actions-get.html', {
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

// POST /actions/:id/tabs
export function postActionsTabsHandler() {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const tab_id = parseInt(req.body.tab_id as unknown as string);
        const id = parseInt(req.params.id as unknown as string);

        await addToTabs(user.id, tab_id, 'bangs', id);

        if (isApiRequest(req)) {
            res.status(201).json({ message: 'Tab added successfully' });
            return;
        }

        req.flash('success', 'Tab added!');
        return res.redirect('/actions');
    };
}

// POST /actions or POST /api/actions
export function postActionHandler(actions: Actions) {
    return async (req: Request, res: Response) => {
        const { url, name, actionType, trigger } = req.body;
        const user = req.user as User;

        if (!url) {
            throw new ValidationError({ url: 'URL is required' });
        }

        if (!name) {
            throw new ValidationError({ name: 'Name is required' });
        }

        if (!actionType) {
            throw new ValidationError({ actionType: 'Action type is required' });
        }

        if (!trigger) {
            throw new ValidationError({ trigger: 'Trigger is required' });
        }

        if (!isValidUrl(url)) {
            throw new ValidationError({ url: 'Invalid URL format' });
        }

        const formattedTrigger: string = normalizeBangTrigger(trigger);

        if (!isOnlyLettersAndNumbers(formattedTrigger.slice(1))) {
            throw new ValidationError({ trigger: 'Trigger can only contain letters and numbers' });
        }

        const existingBang = await db('bangs')
            .where({
                trigger: formattedTrigger,
                user_id: user.id,
            })
            .first();

        if (existingBang) {
            throw new ValidationError({ trigger: 'This trigger already exists' });
        }

        await actions.create({
            name: name.trim(),
            trigger: formattedTrigger.toLowerCase(),
            url,
            actionType,
            user_id: user.id,
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
}

// GET /actions/create
export function getActionCreatePageHandler() {
    return (_req: Request, res: Response) => {
        return res.render('./actions/actions-create.html', {
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
            throw new NotFoundError('Action not found');
        }

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'Action deleted successfully' });
            return;
        }

        req.flash('success', 'Action deleted successfully');
        return res.redirect('/actions');
    };
}

// GET /actions/:id/tabs/create
export function getActionssTabsCreatePageHandler() {
    return async (req: Request, res: Response) => {
        const id = parseInt(req.params.id as unknown as string);
        const action = await db('bangs')
            .where({
                id,
                user_id: req.session.user?.id,
            })
            .first();

        if (!action) {
            throw new NotFoundError('Actions not found');
        }

        const tabs = await db('tabs').where({ user_id: req.session.user?.id });

        return res.render('./actions/actions-id-tabs-create.html', {
            title: `Actions / ${id} / Tabs / Create`,
            path: `/actions/${id}/tabs/create`,
            layout: '../layouts/auth.html',
            action,
            tabs,
        });
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
            throw new NotFoundError('Action not found');
        }

        return res.render('./actions/actions-edit.html', {
            title: 'Actions / Edit',
            path: '/actions/edit',
            layout: '../layouts/auth.html',
            action,
        });
    };
}

// POST /actions/:id/update or PATCH /api/actions/:id
export function updateActionHandler(actions: Actions) {
    return async (req: Request, res: Response) => {
        const { url, name, actionType, trigger } = req.body;
        const user = req.user as User;

        if (!url) {
            throw new ValidationError({ url: 'URL is required' });
        }

        if (!name) {
            throw new ValidationError({ name: 'Name is required' });
        }

        if (!actionType) {
            throw new ValidationError({ actionType: 'Action type is required' });
        }

        if (!trigger) {
            throw new ValidationError({ trigger: 'Trigger is required' });
        }

        if (!isValidUrl(url)) {
            throw new ValidationError({ url: 'Invalid URL format' });
        }

        if (!isOnlyLettersAndNumbers(trigger.slice(1))) {
            throw new ValidationError({ trigger: 'Trigger can only contain letters and numbers' });
        }

        const formattedTrigger = normalizeBangTrigger(trigger);

        const existingBang = await db('bangs')
            .where({
                trigger: formattedTrigger,
                user_id: user.id,
            })
            .whereNot('id', req.params?.id)
            .first();

        if (existingBang) {
            throw new ValidationError({ trigger: 'This trigger already exists' });
        }

        const updatedAction = await actions.update(req.params.id as unknown as number, user.id, {
            trigger: formattedTrigger,
            name: name.trim(),
            url,
            actionType,
        });

        if (isApiRequest(req)) {
            res.status(200).json({
                message: `Action ${updatedAction.trigger} updated successfully!`,
            });
            return;
        }

        req.flash('success', `Action ${updatedAction.trigger} updated successfully!`);
        return res.redirect('/actions');
    };
}

// POST /bookmarks/:id/tabs
export function postBookmarksTabsHandler() {
    return async (req: Request, res: Response) => {
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
    };
}

// GET /bookmarks/:id/tabs/create
export function getBookmarksTabsCreatePageHandler() {
    return async (req: Request, res: Response) => {
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
    };
}

// GET /bookmarks/create
export function getBookmarkCreatePageHandler() {
    return (_req: Request, res: Response) => {
        return res.render('./bookmarks/bookmarks-create.html', {
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

        return res.render('./bookmarks/bookmarks-edit.html', {
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

        return res.render('./bookmarks/bookmarks-id-actions-create.html', {
            title: `Bookmarks / ${req.params.id} / Actions / Create`,
            path: `/bookmarks/${req.params.id}/actions/create`,
            layout: '../layouts/auth.html',
            bookmark,
        });
    };
}

// POST /bookmarks/:id/update or PATCH /api/bookmarks/:id
export function updateBookmarkHandler(bookmarks: Bookmarks) {
    return async (req: Request, res: Response) => {
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

        req.flash('success', `Bookmark ${updatedBookmark.title} updated successfully!`);
        return res.redirect('/bookmarks');
    };
}

// POST /bookmarks or POST /api/bookmarks
export function postBookmarkHandler() {
    return async (req: Request, res: Response) => {
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
            throw new ValidationError(
                { pinned: 'Pinned must be a boolean or checkbox value' },
                req,
            );
        }

        const user = req.user as User;
        const existingBookmark = await checkDuplicateBookmarkUrl(user.id, url);

        if (existingBookmark) {
            throw new ValidationError(
                {
                    url: `URL already bookmarked as "${existingBookmark.title}". Please use a different URL or update the existing bookmark.`,
                },
                req,
            );
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
    };
}

// POST /bookmarks/:id/pin
export function toggleBookmarkPinHandler(bookmarks: Bookmarks) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const bookmarkId = parseInt(req.params.id as unknown as string);

        const currentBookmark = await bookmarks.read(bookmarkId, user.id);

        if (!currentBookmark) {
            throw new NotFoundError('Bookmark not found', req);
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
    };
}

// GET /bookmarks/export
export function getExportBookmarksHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const userId = req.session.user?.id;

        if (!userId) {
            throw new NotFoundError('User not found');
        }

        const bookmarks = (await db
            .select('url', 'title', db.raw("strftime('%s', created_at) as add_date"))
            .from('bookmarks')
            .where({ user_id: userId })) as BookmarkToExport[];

        if (!bookmarks.length) {
            req.flash('info', 'no bookmarks to export yet.');
            return res.redirect('/bookmarks');
        }

        const htmlExport = await generateBookmarkHtmlExport(userId);

        res.setHeader(
            'Content-Disposition',
            `attachment; filename=bookmarks-${new Date().toISOString().split('T')[0]}.html`,
        )
            .setHeader('Content-Type', 'text/html; charset=UTF-8')
            .send(htmlExport);
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
        return res.render('./settings/settings-account.html', {
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
export function postSettingsAccountHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const { username, email, default_search_provider, autocomplete_search_on_homepage } =
            req.body;

        if (!username) {
            throw new ValidationError({ username: 'Username is required' });
        }

        if (!email) {
            throw new ValidationError({ email: 'Email is required' });
        }

        if (!default_search_provider) {
            throw new ValidationError({
                default_search_provider: 'Default search provider is required',
            });
        }

        if (!isValidEmail(email)) {
            throw new ValidationError({ email: 'Please enter a valid email address' });
        }

        if (!Object.keys(defaultSearchProviders).includes(default_search_provider)) {
            throw new ValidationError(
                { default_search_provider: 'Invalid search provider selected' },
                req,
            );
        }

        let parsedAutocompleteSearchOnHomepage = false;
        if (autocomplete_search_on_homepage === undefined) {
            parsedAutocompleteSearchOnHomepage = false;
        } else if (autocomplete_search_on_homepage !== 'on') {
            throw new ValidationError({
                autocomplete_search_on_homepage: 'Invalid autocomplete search on homepage format',
            });
        } else {
            parsedAutocompleteSearchOnHomepage = true;
        }

        await db('users')
            .update({
                email,
                username,
                default_search_provider,
                autocomplete_search_on_homepage: parsedAutocompleteSearchOnHomepage,
            })
            .where({ id: (req.user as User).id });

        req.flash('success', '🔄 updated!');
        return res.redirect('/settings/account');
    };
}

// GET /settings/data
export function getSettingsDataPageHandler() {
    return (req: Request, res: Response) => {
        return res.render('./settings/settings-data.html', {
            user: req.session?.user,
            title: 'Settings Data',
            path: '/settings/data',
            layout: '../layouts/settings.html',
        });
    };
}

// POST /settings/data/export
export function postExportDataHandler() {
    return async (req: Request, res: Response) => {
        const { options } = req.body;

        if (!options || !Array.isArray(options) || options.length === 0) {
            throw new ValidationError(
                { options: 'Please select at least one data type to export' },
                req,
            );
        }

        const userId = (req.user as User).id;
        const includeBookmarks = req.body.options.includes('bookmarks');
        const includeActions = req.body.options.includes('actions');
        const includeNotes = req.body.options.includes('notes');
        const includeTabs = req.body.options.includes('tabs');
        const includeUserPreferences = req.body.options.includes('user_preferences');

        const exportData = await generateUserDataExport(userId, {
            includeBookmarks,
            includeActions,
            includeNotes,
            includeUserPreferences,
            includeTabs,
        });

        res.setHeader(
            'Content-Disposition',
            `attachment; filename=bang-data-export-${exportData.exported_at}.json`,
        )
            .setHeader('Content-Type', 'application/json')
            .send(JSON.stringify(exportData, null, 2));
    };
}

// POST /settings/data/import
export function postImportDataHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const { config } = req.body;

        if (!config) {
            throw new ValidationError({ config: 'Please provide a config' });
        }

        let importData;
        try {
            importData = JSON.parse(req.body.config);
        } catch (error) {
            throw new ValidationError({ config: 'Invalid JSON format' });
        }

        if (!importData.version || importData.version !== '1.0') {
            throw new ValidationError({ config: 'Config version must be 1.0' });
        }

        const userId = req.session.user?.id;

        try {
            await db.transaction(async (trx) => {
                // Import bookmarks
                if (importData.bookmarks?.length > 0) {
                    const bookmarks = importData.bookmarks.map(
                        (bookmark: { title: string; url: string; pinned?: boolean }) => ({
                            user_id: userId,
                            title: bookmark.title,
                            url: bookmark.url,
                            pinned: bookmark.pinned || false,
                            created_at: db.fn.now(),
                        }),
                    );
                    await trx('bookmarks').insert(bookmarks);
                }

                // Import actions
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

                // Import notes
                if (importData.notes?.length > 0) {
                    const notes = importData.notes.map(
                        (note: { title: string; content: string; pinned?: boolean }) => ({
                            user_id: userId,
                            title: note.title,
                            content: note.content,
                            pinned: note.pinned || false,
                            created_at: db.fn.now(),
                        }),
                    );

                    await trx('notes').insert(notes);
                }

                // Import tabs and tab items
                if (importData.tabs?.length > 0) {
                    for (const tabData of importData.tabs) {
                        // Insert the tab first
                        const [tabId] = await trx('tabs')
                            .insert({
                                user_id: userId,
                                trigger: tabData.trigger,
                                title: tabData.title,
                                created_at: db.fn.now(),
                            })
                            .returning('id');

                        // Insert the tab items if they exist
                        if (tabData.items?.length > 0) {
                            const tabItems = tabData.items.map(
                                (item: { title: string; url: string }) => ({
                                    tab_id: typeof tabId === 'object' ? tabId.id : tabId,
                                    title: item.title,
                                    url: item.url,
                                    created_at: db.fn.now(),
                                }),
                            );

                            await trx('tab_items').insert(tabItems);
                        }
                    }
                }

                // Import user preferences
                if (importData.user_preferences) {
                    const userPrefs = importData.user_preferences;
                    const updateData: any = {};

                    // Only update allowed fields
                    if (userPrefs.username) {
                        updateData.username = userPrefs.username;
                    }
                    if (userPrefs.default_search_provider) {
                        updateData.default_search_provider = userPrefs.default_search_provider;
                    }
                    if (userPrefs.autocomplete_search_on_homepage !== undefined) {
                        updateData.autocomplete_search_on_homepage =
                            userPrefs.autocomplete_search_on_homepage;
                    }
                    if (userPrefs.column_preferences) {
                        updateData.column_preferences =
                            typeof userPrefs.column_preferences === 'string'
                                ? userPrefs.column_preferences
                                : JSON.stringify(userPrefs.column_preferences);
                    }

                    if (Object.keys(updateData).length > 0) {
                        await trx('users').where('id', userId).update(updateData);

                        // Update session with new preferences
                        if (req.session?.user && updateData.column_preferences) {
                            try {
                                req.session.user.column_preferences =
                                    typeof updateData.column_preferences === 'string'
                                        ? JSON.parse(updateData.column_preferences)
                                        : updateData.column_preferences;
                            } catch (error) {
                                // Handle parsing error gracefully
                            }
                        }
                    }
                }
            });

            req.flash('success', 'Data imported successfully!');
        } catch (error) {
            logger.error('Import error: %o', error);
            req.flash('error', 'Failed to import data. Please check the format and try again.');
        }

        return res.redirect('/settings/data');
    };
}

// GET /settings/danger-zone
export function getSettingsDangerZonePageHandler() {
    return (req: Request, res: Response) => {
        return res.render('./settings/settings-danger-zone.html', {
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
        const user = req.session.user;

        if (!user) {
            throw new NotFoundError('User not found');
        }

        const exportOptions = req.body.export_options || [];
        const includeJson = Array.isArray(exportOptions)
            ? exportOptions.includes('json')
            : exportOptions === 'json';
        const includeHtml = Array.isArray(exportOptions)
            ? exportOptions.includes('html')
            : exportOptions === 'html';

        if (includeJson || includeHtml) {
            try {
                await sendDataExportEmail({
                    email: user.email,
                    username: user.username,
                    req,
                    includeJson,
                    includeHtml,
                });
            } catch (error) {
                logger.error('Failed to send export email before account deletion: %o', { error });
            }
        }

        await db('users').where({ id: user.id }).delete();

        if ((req.session && req.session.user) || req.user) {
            req.session.user = null;
            req.user = undefined;
            req.session.destroy((error) => {
                if (error) {
                    throw new HttpError(error);
                }
            });
        }

        return res.redirect(`/?toast=🗑️ You're account has been delted!`);
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
export function postSettingsDisplayHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const { column_preferences } = req.body;

        if (!column_preferences || typeof column_preferences !== 'object') {
            throw new ValidationError('Column preferences must be an object', req);
        }

        // bookmarks
        if (typeof column_preferences.bookmarks !== 'object') {
            throw new ValidationError('Bookmarks must be an object', req);
        }

        column_preferences.bookmarks.title = column_preferences.bookmarks.title === 'on';
        column_preferences.bookmarks.url = column_preferences.bookmarks.url === 'on';
        column_preferences.bookmarks.created_at = column_preferences.bookmarks.created_at === 'on';
        column_preferences.bookmarks.pinned = column_preferences.bookmarks.pinned === 'on';

        column_preferences.bookmarks.default_per_page = parseInt(
            column_preferences.bookmarks.default_per_page,
            10,
        );

        if (
            isNaN(column_preferences.bookmarks.default_per_page) ||
            column_preferences.bookmarks.default_per_page < 1
        ) {
            throw new ValidationError('Bookmarks per page must be greater than 0', req);
        }

        if (
            !column_preferences.bookmarks.title &&
            !column_preferences.bookmarks.url &&
            !column_preferences.bookmarks.created_at &&
            !column_preferences.bookmarks.pinned
        ) {
            throw new ValidationError('At least one bookmark column must be enabled', req);
        }

        // actions
        if (typeof column_preferences.actions !== 'object') {
            throw new ValidationError('Actions must be an object', req);
        }

        column_preferences.actions.name = column_preferences.actions.name === 'on';
        column_preferences.actions.trigger = column_preferences.actions.trigger === 'on';
        column_preferences.actions.url = column_preferences.actions.url === 'on';
        column_preferences.actions.action_type = column_preferences.actions.action_type === 'on';
        column_preferences.actions.created_at = column_preferences.actions.created_at === 'on';
        column_preferences.actions.last_read_at = column_preferences.actions.last_read_at === 'on';
        column_preferences.actions.usage_count = column_preferences.actions.usage_count === 'on';

        column_preferences.actions.default_per_page = parseInt(
            column_preferences.actions.default_per_page,
            10,
        );

        if (
            isNaN(column_preferences.actions.default_per_page) ||
            column_preferences.actions.default_per_page < 1
        ) {
            throw new ValidationError('Actions per page must be greater than 0', req);
        }

        if (
            !column_preferences.actions.name &&
            !column_preferences.actions.trigger &&
            !column_preferences.actions.url &&
            !column_preferences.actions.action_type &&
            !column_preferences.actions.last_read_at &&
            !column_preferences.actions.usage_count &&
            !column_preferences.actions.created_at
        ) {
            throw new ValidationError('At least one action column must be enabled', req);
        }

        // notes
        if (typeof column_preferences.notes !== 'object') {
            throw new ValidationError('Notes must be an object', req);
        }

        column_preferences.notes.title = column_preferences.notes.title === 'on';
        column_preferences.notes.content = column_preferences.notes.content === 'on';
        column_preferences.notes.created_at = column_preferences.notes.created_at === 'on';
        column_preferences.notes.pinned = column_preferences.notes.pinned === 'on';

        // Handle view_type preference
        if (
            column_preferences.notes.view_type &&
            !['card', 'table'].includes(column_preferences.notes.view_type)
        ) {
            column_preferences.notes.view_type = 'table'; // Default to table if invalid
        }

        if (
            !column_preferences.notes.title &&
            !column_preferences.notes.content &&
            !column_preferences.notes.pinned
        ) {
            throw new ValidationError('At least one note column must be enabled', req);
        }

        column_preferences.notes.default_per_page = parseInt(
            column_preferences.notes.default_per_page,
            10,
        );

        if (
            isNaN(column_preferences.notes.default_per_page) ||
            column_preferences.notes.default_per_page < 1
        ) {
            throw new ValidationError('Notes per page must be greater than 0', req);
        }

        // Preserve the view_type if it's not in the form submission
        if (
            !column_preferences.notes.view_type &&
            req.session?.user?.column_preferences?.notes?.view_type
        ) {
            column_preferences.notes.view_type =
                req.session.user.column_preferences.notes.view_type;
        }

        // users (admin only)
        if (req.user?.is_admin && column_preferences.users) {
            if (typeof column_preferences.users !== 'object') {
                throw new ValidationError('Users must be an object', req);
            }

            column_preferences.users.username = column_preferences.users.username === 'on';
            column_preferences.users.email = column_preferences.users.email === 'on';
            column_preferences.users.is_admin = column_preferences.users.is_admin === 'on';
            column_preferences.users.email_verified_at =
                column_preferences.users.email_verified_at === 'on';
            column_preferences.users.created_at = column_preferences.users.created_at === 'on';

            column_preferences.users.default_per_page = parseInt(
                column_preferences.users.default_per_page,
                10,
            );

            if (
                isNaN(column_preferences.users.default_per_page) ||
                column_preferences.users.default_per_page < 1
            ) {
                throw new ValidationError('Users per page must be greater than 0', req);
            }

            if (
                !column_preferences.users.username &&
                !column_preferences.users.email &&
                !column_preferences.users.is_admin &&
                !column_preferences.users.email_verified_at &&
                !column_preferences.users.created_at
            ) {
                throw new ValidationError('At least one user column must be enabled', req);
            }
        }

        const user = req.user as User;
        const { path } = req.body;

        await db('users')
            .where('id', user.id)
            .update({
                column_preferences: JSON.stringify(column_preferences),
            });

        req.session.user!.column_preferences = column_preferences;

        req.flash('success', 'Column settings updated');

        return res.redirect(path);
    };
}

// POST /api/notes/render-markdown
export function postNotesRenderMarkdownHandler() {
    return async (req: Request, res: Response) => {
        const { content } = req.body;

        if (!content || content.trim() === '') {
            throw new ValidationError({ content: 'Content is required' });
        }

        const { marked } = await import('marked');
        const markdown = marked(content) as string;

        res.json({ content: markdown });
        return;
    };
}

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
            data.map(async (d: any) => ({
                ...d,
                content: await convertMarkdownToPlainText(d.content, 200),
            })),
        );

        return res.render('./notes/notes-get.html', {
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
        return res.render('./notes/notes-create.html', {
            title: 'Notes / Create',
            path: '/notes/create',
            layout: '../layouts/auth',
        });
    };
}

// POST /notes or /api/notes
export function postNoteHandler(notes: Notes) {
    return async (req: Request, res: Response) => {
        const { title, content, pinned } = req.body;

        if (!title) {
            throw new ValidationError({ title: 'Title is required' });
        }

        if (!content) {
            throw new ValidationError({ content: 'Content is required' });
        }

        if (pinned !== undefined && typeof pinned !== 'boolean' && pinned !== 'on') {
            throw new ValidationError(
                { pinned: 'Pinned must be a boolean or checkbox value' },
                req,
            );
        }

        const user = req.user as User;

        const note = await notes.create({
            user_id: user.id,
            title: title.trim(),
            content: content.trim(),
            pinned: pinned === 'on' || pinned === true,
        });

        if (isApiRequest(req)) {
            res.status(201).json({ message: `Note ${note.title} created successfully!` });
            return;
        }

        req.flash('success', 'Note created successfully');
        return res.redirect('/notes');
    };
}

// GET /notes/:id/edit
export function getEditNotePageHandler(notes: Notes) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const note = await notes.read(parseInt(req.params.id as unknown as string), user.id);

        if (!note) {
            throw new NotFoundError('Note not found', req);
        }

        return res.render('./notes/notes-edit.html', {
            title: 'Notes / Edit',
            path: '/notes/edit',
            layout: '../layouts/auth',
            note,
        });
    };
}

// POST /notes/:id/update or PATCH /api/notes/:id
export function updateNoteHandler(notes: Notes) {
    return async (req: Request, res: Response) => {
        const { title, content, pinned } = req.body;

        if (!title) {
            throw new ValidationError({ title: 'Title is required' });
        }

        if (!content) {
            throw new ValidationError({ content: 'Content is required' });
        }

        if (pinned !== undefined && typeof pinned !== 'boolean' && pinned !== 'on') {
            throw new ValidationError(
                { pinned: 'Pinned must be a boolean or checkbox value' },
                req,
            );
        }

        const user = req.user as User;

        const updatedNote = await notes.update(
            parseInt(req.params.id as unknown as string),
            user.id,
            {
                title: title.trim(),
                content: content.trim(),
                pinned: pinned === 'on' || pinned === true, // Handle both checkbox and API boolean
            },
        );

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'note updated successfully' });
            return;
        }

        req.flash('success', `Note ${updatedNote.title} updated successfully`);
        return res.redirect(`/notes/${updatedNote.id}`);
    };
}

// GET /notes/:id or GET /api/notes/:id
export function getNoteHandler(notes: Notes, log: typeof logger) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        let note = await notes.read(parseInt(req.params.id as unknown as string), user.id);

        if (!note) {
            throw new NotFoundError('Note not found', req);
        }

        let content: string = '';

        try {
            const { marked } = await import('marked');
            content = marked(note.content) as string;
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

        return res.render('./notes/notes-show.html', {
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

// POST /notes/:id/pin
export function toggleNotePinHandler(notes: Notes) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const noteId = parseInt(req.params.id as unknown as string);

        const currentNote = await notes.read(noteId, user.id);

        if (!currentNote) {
            throw new NotFoundError('Note not found', req);
        }

        const updatedNote = await notes.update(noteId, user.id, {
            pinned: !currentNote.pinned,
        });

        if (isApiRequest(req)) {
            res.status(200).json({
                message: `Note ${updatedNote.pinned ? 'pinned' : 'unpinned'} successfully`,
                data: updatedNote,
            });
            return;
        }

        req.flash('success', `Note ${updatedNote.pinned ? 'pinned' : 'unpinned'} successfully`);
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
    };
}

// POST /login
export function postLoginHandler() {
    return async (req: Request, res: Response) => {
        const { email } = req.body;

        if (!email) {
            throw new ValidationError({ email: 'Email is required' });
        }

        if (!isValidEmail(email)) {
            throw new ValidationError({ email: 'Please enter a valid email address' });
        }

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

        setTimeout(() => sendMagicLinkEmail({ email, token, req }), 0);

        req.flash(
            'success',
            `📧 Magic link sent to ${email}! Check your email and click the link to log in.`,
        );
        return res.redirect(req.headers.referer || '/');
    };
}

// GET /auth/magic/:token
export function getMagicLinkHandler() {
    return async (req: Request, res: Response) => {
        const { token } = req.params;

        const decoded = magicLink.verify(token!);

        if (!decoded || !decoded.email) {
            req.flash('error', 'Magic link has expired or is invalid. Please request a new one.');
            return res.redirect('/?modal=login');
        }

        const user = await db('users').where({ email: decoded.email }).first();

        if (!user) {
            throw new NotFoundError('User not found', req);
        }

        await db('users').where({ id: user.id }).update({ email_verified_at: db.fn.now() });

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

// GET
export function rateLimitHandler() {
    return async (req: Request, res: Response) => {
        if (isApiRequest(req)) {
            return res.json({ message: 'Too many requests, please try again later.' });
        }

        return res.status(429).render('./rate-limit.html');
    };
}

// GET /bangs
export function getBangsPage() {
    return async (req: Request, res: Response) => {
        const {
            search: searchTerm = '',
            sort_key = 't',
            direction = 'asc',
            page = 1,
            per_page = 100,
        } = req.query;

        const bangsArray = Object.values(bangs as Record<string, Bang>);

        const filteredBangs = bangsArray.filter(
            (bang) =>
                bang.t.toLowerCase().includes(String(searchTerm).toLowerCase()) ||
                bang.s.toLowerCase().includes(String(searchTerm).toLowerCase()) ||
                bang.d.toLowerCase().includes(String(searchTerm).toLowerCase()),
        );

        const sortedBangs = filteredBangs.sort((a, b) => {
            const key = sort_key as keyof Bang;
            if (a[key] < b[key]) return direction === 'asc' ? -1 : 1;
            if (a[key] > b[key]) return direction === 'asc' ? 1 : -1;
            return 0;
        });

        const { data, ...pagination } = paginate(sortedBangs, {
            page: Number(page),
            perPage: Number(per_page),
            total: sortedBangs.length,
        });

        return res.render('./bangs/bangs-get.html', {
            layout: '../layouts/auth.html',
            howToContent: await getConvertedReadmeMDToHTML(),
            user: req.session.user,
            path: req.path,
            data,
            pagination,
            search: searchTerm,
            sortKey: sort_key,
            direction,
        });
    };
}

// GET /tabs or GET /api/tabs
export function getTabsPageHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const { perPage, page, search, sortKey, direction } = extractPagination(req, 'tabs');

        let tabsQuery = db
            .select(
                'tabs.*',
                db.raw('GROUP_CONCAT(tab_items.id) as item_ids'),
                db.raw('GROUP_CONCAT(tab_items.title) as item_titles'),
                db.raw('GROUP_CONCAT(tab_items.url) as item_urls'),
                db.raw('GROUP_CONCAT(tab_items.created_at) as item_created_ats')
            )
            .from('tabs')
            .leftJoin('tab_items', 'tabs.id', 'tab_items.tab_id')
            .where('tabs.user_id', user.id)
            .groupBy('tabs.id');

        if (search) {
            tabsQuery = tabsQuery.where((builder) => {
                builder
                    .whereRaw('LOWER(tabs.title) LIKE ?', [`%${search.toLowerCase()}%`])
                    .orWhereRaw('LOWER(tabs.trigger) LIKE ?', [`%${search.toLowerCase()}%`])
                    .orWhereRaw('LOWER(tab_items.title) LIKE ?', [`%${search.toLowerCase()}%`])
                    .orWhereRaw('LOWER(tab_items.url) LIKE ?', [`%${search.toLowerCase()}%`]);
            });
        }

        const { data: rawTabs, pagination } = await tabsQuery
            .orderBy(sortKey || 'created_at', direction || 'desc')
            .paginate({ perPage, currentPage: page, isLengthAware: true });

        const tabs = rawTabs.map((tab) => {
            const items = [];
            if (tab.item_ids) {
                const ids = tab.item_ids.split(',');
                const titles = tab.item_titles.split(',');
                const urls = tab.item_urls.split(',');
                const createdAts = tab.item_created_ats.split(',');

                for (let i = 0; i < ids.length; i++) {
                    items.push({
                        id: ids[i],
                        title: titles[i],
                        url: urls[i],
                        created_at: createdAts[i],
                    });
                }
            }
            return { ...tab, items };
        });

        if (isApiRequest(req)) {
            res.status(200).json({
                message: 'Tabs retrieved successfully',
                data: tabs,
                pagination,
                search,
                sortKey,
                direction,
            });
            return;
        }

        return res.render('tabs/tabs-get.html', {
            title: 'Tabs',
            path: '/tabs',
            layout: '../layouts/auth.html',
            howToContent: await getConvertedReadmeMDToHTML(),
            tabs,
            user,
            pagination,
            search,
            sortKey,
            direction,
        });
    };
}

// POST /tabs or POST /api/tabs
export function postTabsPageHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;

        const { title, trigger } = req.body;

        if (!title) {
            throw new ValidationError({ title: 'Title is required' });
        }

        if (!trigger) {
            throw new ValidationError({ trigger: 'Trigger is required' });
        }

        const formattedTrigger: string = normalizeBangTrigger(trigger);

        if (!isOnlyLettersAndNumbers(formattedTrigger.slice(1))) {
            throw new ValidationError({ trigger: 'Trigger can only contain letters and numbers' });
        }

        const existingTrigger = await db('tabs')
            .where({
                trigger: formattedTrigger,
                user_id: user.id,
            })
            .first();

        const existingAction = await db.select('*').from('bangs').where({
            user_id: user.id,
            trigger: formattedTrigger,
        });

        if (existingAction.length) {
            throw new ValidationError({
                trigger: 'This trigger already exists in Actions. Please choose another one!',
            });
        }

        if (existingTrigger) {
            throw new ValidationError({ trigger: 'This trigger already exists' });
        }

        await db('tabs').insert({
            user_id: user.id,
            title,
            trigger: formattedTrigger,
        });

        if (isApiRequest(req)) {
            res.status(201).json({ message: 'Tab group created successfully' });
            return;
        }

        req.flash('success', 'Tab group created!');
        return res.redirect('/tabs');
    };
}

// GET /tabs/create
export function getTabCreatePageHandler() {
    return async (req: Request, res: Response) => {
        return res.render('./tabs/tabs-create.html', {
            title: 'Tabs / Create',
            path: '/tabs/create',
            layout: '../layouts/auth.html',
            user: req.session.user,
        });
    };
}

// GET /tabs/:id/edit
export function getTabEditPageHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const tab = await db('tabs').where({ id: req.params.id }).first();

        return res.render('./tabs/tabs-edit.html', {
            title: 'Tabs / Edit',
            path: `/tabs/${req.params.id}/edit`,
            layout: '../layouts/auth.html',
            user: req.session.user,
            tab,
        });
    };
}

// POST /tabs/:id/update or PATCH /api/tabs/:id
export function updateTabHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;

        const { title, trigger } = req.body;

        const tab = await db('tabs').where({ id: req.params.id }).first();

        if (!tab) {
            throw new NotFoundError('Tab group not found');
        }

        if (!title) {
            throw new ValidationError({ title: 'Title is required' });
        }

        if (!trigger) {
            throw new ValidationError({ trigger: 'Trigger is required' });
        }

        const formattedTrigger: string = normalizeBangTrigger(trigger);

        if (!isOnlyLettersAndNumbers(formattedTrigger.slice(1))) {
            throw new ValidationError({ trigger: 'Trigger can only contain letters and numbers' });
        }

        const existingAction = await db.select('*').from('bangs').where({
            user_id: user.id,
            trigger: formattedTrigger,
        });

        if (existingAction.length) {
            throw new ValidationError({
                trigger: 'This trigger already exists in Actions. Please choose another one!',
            });
        }

        const existingTrigger = await db('tabs')
            .where({
                trigger: formattedTrigger,
                user_id: user.id,
            })
            .whereNot({ id: tab.id })
            .first();

        if (existingTrigger) {
            throw new ValidationError({ trigger: 'This trigger already exists' });
        }

        await db('tabs').where({ id: req.params.id }).update({
            user_id: user.id,
            title,
            trigger: formattedTrigger,
        });

        req.flash('success', 'Tab group updated!');
        return res.redirect('/tabs');
    };
}

// GET /tabs/:id/launch
export function getTabsLaunchHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const id = req.params.id;

        const tabGroup = await db('tabs').where({ user_id: user.id, id }).first();

        if (!tabGroup) {
            throw new NotFoundError('Tab group not found', req);
        }

        const tabs = await db('tab_items')
            .where({ tab_id: tabGroup.id })
            .orderBy('created_at', 'asc');

        return res.render('tabs/tabs-launch.html', {
            title: `Tabs Launch: ${tabGroup.title}`,
            path: `/tabs/${id}/launch`,
            layout: '../layouts/auth.html',
            tabGroup,
            tabs,
            user,
        });
    };
}

// POST /tabs/:id/delete or DELETE /api/tabs/:id
export function deleteTabHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const tabId = parseInt(req.params.id as unknown as string);

        await db('tabs').where({ user_id: user.id, id: tabId }).delete();

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'Tab group deleted successfully' });
            return;
        }

        req.flash('success', 'Tab group deleted!');
        return res.redirect('/tabs');
    };
}

// POST /tabs/delete-all
export function deleteAllTabsHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;

        await db('tabs').where({ user_id: user.id }).delete();

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'All tab groups deleted successfully' });
            return;
        }

        req.flash('success', 'All tab groups deleted!');
        return res.redirect('/tabs');
    };
}

// GET /tabs/:id/items/create
export function getTabItemCreatePageHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const tabId = req.params.id;
        const tab = await db('tabs').where({ id: tabId, user_id: user.id }).first();

        if (!tab) {
            throw new NotFoundError('Tab group not found');
        }

        return res.render('tabs/tabs-items-create.html', {
            title: 'Add Tab Item',
            path: `/tabs/${tabId}/items/create`,
            layout: '../layouts/auth.html',
            tab,
            user,
        });
    };
}

// POST /tabs/:id/items/:itemId/update
export function postTabItemUpdateHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const { id, itemId } = req.params;

        const tab = await db('tabs').where({ id, user_id: user.id }).first();

        if (!tab) {
            throw new NotFoundError('Tab group not found');
        }

        const { title, url } = req.body;

        if (!title) {
            throw new ValidationError({ title: 'Title is required' });
        }

        if (!url) {
            throw new ValidationError({ url: 'URL is required' });
        }

        if (!isValidUrl(url)) {
            throw new ValidationError({ url: 'Invalid URL format' });
        }

        const tabItem = await db('tab_items').where({ id: itemId, tab_id: id }).first();

        if (!tabItem) {
            throw new NotFoundError('Tab item not found');
        }

        await db.transaction(async (trx) => {
            await trx('tab_items').where({ id: itemId, tab_id: id }).update({
                title,
                url,
                updated_at: db.fn.now(),
            });

            await trx('tabs').where({ id }).update({ updated_at: db.fn.now() });
        });

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'Tab item updated successfully' });
            return;
        }

        req.flash('success', 'Tab item updated!');
        return res.redirect(`/tabs`);
    };
}

// GET /tabs/:id/items/:itemId/edit
export function getTabItemEditPageHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const { id, itemId } = req.params;

        const tab = await db.select('*').from('tabs').where({ id, user_id: user.id }).first();

        if (!tab) {
            throw new NotFoundError('Tab group not found');
        }

        const tabItem = await db
            .select('*')
            .from('tab_items')
            .where({ id: itemId, tab_id: id })
            .first();

        if (!tabItem) {
            throw new NotFoundError('Tab item not found');
        }

        return res.render('tabs/tabs-items-edit.html', {
            title: 'Edit Tab Item',
            path: `/tabs/${id}/items/${itemId}/edit`,
            layout: '../layouts/auth.html',
            tabItem,
            user,
        });
    };
}

// POST /tabs/:id/items/create
export function postTabItemCreateHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const user = req.user as User;
        const tabId = req.params.id;
        const { title, url } = req.body;

        if (!title) {
            throw new ValidationError({ title: 'Title is required' });
        }

        if (!url) {
            throw new ValidationError({ url: 'URL is required' });
        }

        if (!isValidUrl(url)) {
            throw new ValidationError({ url: 'Invalid URL format' });
        }

        const tab = await db('tabs').where({ id: tabId, user_id: user.id }).first();

        if (!tab) {
            throw new NotFoundError('Tab group not found');
        }

        await db('tab_items').insert({
            tab_id: tab.id,
            title,
            url,
        });

        if (isApiRequest(req)) {
            res.status(201).json({ message: 'Tab item created successfully' });
            return;
        }

        req.flash('success', 'Tab item added!');
        return res.redirect('/tabs');
    };
}

// POST /tabs/:id/items/:itemId/delete
export function deleteTabItemHandler(db: Knex) {
    return async (req: Request, res: Response) => {
        const tabId = parseInt(req.params.id as unknown as string);
        const itemId = parseInt(req.params.itemId as unknown as string);

        await db.transaction(async (trx) => {
            await trx('tab_items').where({ id: itemId, tab_id: tabId }).delete();
            await trx('tabs').where({ id: tabId }).update({ updated_at: db.fn.now() });
        });

        if (isApiRequest(req)) {
            res.status(200).json({ message: 'Tab item deleted successfully' });
            return;
        }

        req.flash('success', 'Tab item deleted!');
        return res.redirect(`/tabs`);
    };
}
