import express from 'express';

import {
    getNoteHandler,
    getLoginHandler,
    getGithubHandler,
    getLogoutHandler,
    getNotesHandler,
    postNoteHandler,
    getActionHandler,
    getActionsHandler,
    getHealthzHandler,
    postSearchHandler,
    postActionHandler,
    deleteNoteHandler,
    updateNoteHandler,
    getHowToPageHandler,
    updateActionHandler,
    deleteActionHandler,
    getBookmarkHandler,
    getBookmarksHandler,
    postBookmarkHandler,
    getAdminUsersHandler,
    postExportDataHandler,
    postImportDataHandler,
    deleteBookmarkHandler,
    updateBookmarkHandler,
    getCollectionsHandler,
    getSettingsPageHandler,
    getEditNotePageHandler,
    getGithubRedirectHandler,
    getNoteCreatePageHandler,
    getEditActionPageHandler,
    getExportBookmarksHandler,
    getEditBookmarkPageHandler,
    getActionCreatePageHandler,
    getSettingsDataPageHandler,
    postSettingsAccountHandler,
    postSettingsDisplayHandler,
    postDeleteAdminUserHandler,
    getPrivacyPolicyPageHandler,
    getHomePageAndSearchHandler,
    getBookmarkCreatePageHandler,
    getTermsOfServicePageHandler,
    getSettingsAccountPageHandler,
    postSettingsCreateApiKeyHandler,
    getSettingsDangerZonePageHandler,
    getBookmarkActionCreatePageHandler,
    postDeleteSettingsDangerZoneHandler,
} from './handler';

import {
    csrfMiddleware,
    cacheMiddleware,
    adminOnlyMiddleware,
    authenticationMiddleware,
} from './middleware';

import { db } from './db/db';
import { search } from './search';
import { api, github, insertBookmarkQueue } from './util';
import { actions, bookmarks, notes } from './repository';

const router = express.Router();

router.get('/healthz', getHealthzHandler(db));
router.get('/privacy-policy', getPrivacyPolicyPageHandler());
router.get('/terms-of-service', getTermsOfServicePageHandler());
router.get('/', csrfMiddleware, getHomePageAndSearchHandler(search));
router.get('/how-to', cacheMiddleware(1, 'day'), getHowToPageHandler());

router.get('/login', getLoginHandler());
router.get('/logout', getLogoutHandler());
router.get('/oauth/github', getGithubHandler());
router.post('/search', csrfMiddleware, postSearchHandler(search));
router.get('/oauth/github/redirect', getGithubRedirectHandler(db, github));

router.get('/admin', authenticationMiddleware, adminOnlyMiddleware, csrfMiddleware, getAdminUsersHandler(db)); // prettier-ignore
router.get('/admin/users', authenticationMiddleware, adminOnlyMiddleware, csrfMiddleware, getAdminUsersHandler(db)); // prettier-ignore
router.post('/admin/users/:id/delete', authenticationMiddleware, adminOnlyMiddleware, csrfMiddleware, postDeleteAdminUserHandler(db)); // prettier-ignore

router.get('/settings', authenticationMiddleware, getSettingsPageHandler());
router.get('/settings/data', authenticationMiddleware, csrfMiddleware, getSettingsDataPageHandler()); // prettier-ignore
router.get('/settings/account', authenticationMiddleware, csrfMiddleware, getSettingsAccountPageHandler()); // prettier-ignore
router.get('/settings/danger-zone', authenticationMiddleware, csrfMiddleware, getSettingsDangerZonePageHandler()); // prettier-ignore
router.post('/settings/create-api-key', authenticationMiddleware, csrfMiddleware, postSettingsCreateApiKeyHandler(db, api)); // prettier-ignore
router.post('/settings/danger-zone/delete', authenticationMiddleware, csrfMiddleware, postDeleteSettingsDangerZoneHandler(db)); // prettier-ignore
router.post('/settings/data/export', authenticationMiddleware, csrfMiddleware, postExportDataHandler.validator, postExportDataHandler.handler(db)); // prettier-ignore
router.post('/settings/data/import', authenticationMiddleware, csrfMiddleware, postImportDataHandler.validator, postImportDataHandler.handler(db)); // prettier-ignore
router.post('/settings/account', authenticationMiddleware, csrfMiddleware, postSettingsAccountHandler.validator, postSettingsAccountHandler.handler(db)); // prettier-ignore
router.post('/settings/display', authenticationMiddleware, csrfMiddleware, postSettingsDisplayHandler.validator, postSettingsDisplayHandler.handler(db)); // prettier-ignore

router.get('/actions', authenticationMiddleware, csrfMiddleware, getActionsHandler(actions));
router.get('/actions/create', authenticationMiddleware, csrfMiddleware, getActionCreatePageHandler()); // prettier-ignore
router.get('/actions/:id/edit', authenticationMiddleware, csrfMiddleware, getEditActionPageHandler(db)); // prettier-ignore
router.post('/actions/:id/delete', authenticationMiddleware, csrfMiddleware, deleteActionHandler(actions)); // prettier-ignore
router.post('/actions', authenticationMiddleware, csrfMiddleware, postActionHandler.validator, postActionHandler.handler(actions)); // prettier-ignore
router.post('/actions/:id/update', authenticationMiddleware, csrfMiddleware, updateActionHandler.validator, updateActionHandler.handler(actions)); // prettier-ignore

router.get('/bookmarks/export', authenticationMiddleware, getExportBookmarksHandler(db));
router.get('/bookmarks', authenticationMiddleware, csrfMiddleware, getBookmarksHandler(bookmarks));
router.get('/bookmarks/create', authenticationMiddleware, csrfMiddleware, getBookmarkCreatePageHandler()); // prettier-ignore
router.post('/bookmarks/:id/delete', authenticationMiddleware, csrfMiddleware, deleteBookmarkHandler(bookmarks)); // prettier-ignore
router.get('/bookmarks/:id/edit', authenticationMiddleware, csrfMiddleware,  getEditBookmarkPageHandler(bookmarks)); // prettier-ignore
router.get('/bookmarks/:id/actions/create', authenticationMiddleware, csrfMiddleware, getBookmarkActionCreatePageHandler(db)); // prettier-ignore
router.post('/bookmarks', authenticationMiddleware, csrfMiddleware, postBookmarkHandler.validator, postBookmarkHandler.handler(insertBookmarkQueue)); // prettier-ignore
router.post('/bookmarks/:id/update', authenticationMiddleware, csrfMiddleware, updateBookmarkHandler.validator, updateBookmarkHandler.handler(bookmarks)); // prettier-ignore

router.get('/notes', authenticationMiddleware, csrfMiddleware, getNotesHandler(notes));
router.get('/notes/create', authenticationMiddleware, csrfMiddleware, getNoteCreatePageHandler());
router.get('/notes/:id', authenticationMiddleware, csrfMiddleware, getNoteHandler(notes));
router.post('/notes/:id/delete', authenticationMiddleware, csrfMiddleware, deleteNoteHandler(notes)); // prettier-ignore
router.get('/notes/:id/edit', authenticationMiddleware, csrfMiddleware, getEditNotePageHandler(notes)); // prettier-ignore
router.post('/notes', authenticationMiddleware, csrfMiddleware, postNoteHandler.validator, postNoteHandler.handler(notes)); // prettier-ignore
router.post('/notes/:id/update', authenticationMiddleware, csrfMiddleware, updateNoteHandler.validator, updateNoteHandler.handler(notes)); // prettier-ignore

/**
 * A action
 * @typedef {object} Action
 * @property {string} url.required - url
 * @property {string} name.required - name
 * @property {string} actionType.required - actionType
 * @property {string} trigger.required - trigger
 */

/**
 *
 * GET /api/actions
 *
 * @tags Actions
 * @summary get actions
 *
 * @security BearerAuth
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.get('/api/actions', authenticationMiddleware, getActionsHandler(actions));

/**
 *
 * GET /api/actions/{id}
 *
 * @tags Actions
 * @summary get a specific action
 *
 * @security BearerAuth
 *
 * @param {string} id.path.required - action id
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.get('/api/actions/:id', authenticationMiddleware, getActionHandler(actions));

/**
 *
 * POST /api/actions
 *
 * @tags Actions
 * @summary create a action
 *
 * @security BearerAuth
 *
 * @param {Action} request.body.required - action info
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.post('/api/actions', authenticationMiddleware, postActionHandler.validator, postActionHandler.handler(actions)); // prettier-ignore

/**
 *
 * PATCH /api/actions/{id}
 *
 * @tags Actions
 * @summary update a action
 *
 * @security BearerAuth
 *
 * @param {string} id.path.required - action id
 * @param {Action} request.body.required - action info
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.patch('/api/actions/:id', authenticationMiddleware, updateActionHandler.validator, updateActionHandler.handler(actions)); // prettier-ignore

/**
 *
 * DELETE /api/actions/{id}
 *
 * @tags Actions
 * @summary delete a action
 *
 * @security BearerAuth
 *
 * @param {string} id.path.required - action id
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.delete('/api/actions/:id', authenticationMiddleware, deleteActionHandler(actions));

/**
 * A bookmark
 * @typedef {object} Bookmark
 * @property {string} url.required - url
 * @property {string} title.required - title
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
router.get('/api/bookmarks', authenticationMiddleware, getBookmarksHandler(bookmarks));

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
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.get('/api/bookmarks/:id', authenticationMiddleware, getBookmarkHandler(bookmarks)); // prettier-ignore

/**
 *
 * POST /api/bookmarks
 *
 * @tags Bookmarks
 * @summary create a bookmarks
 *
 * @security BearerAuth
 *
 * @param {Bookmark} request.body.required - bookmark info
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.post('/api/bookmarks', authenticationMiddleware, postBookmarkHandler.validator, postBookmarkHandler.handler(insertBookmarkQueue)); // prettier-ignore

/**
 *
 * PATCH /api/bookmarks/{id}
 *
 * @tags Bookmarks
 * @summary update a bookmarks
 *
 * @security BearerAuth
 *
 * @param {number} id.path.required - bookmark id
 * @param {Bookmark} request.body.required - bookmark info
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.patch('/api/bookmarks/:id', authenticationMiddleware, updateBookmarkHandler.validator, updateBookmarkHandler.handler(bookmarks)); // prettier-ignore

/**
 *
 * DELETE /api/bookmarks/{id}
 *
 * @tags Bookmarks
 * @summary delete a bookmark
 *
 * @security BearerAuth
 *
 * @param {string} id.path.required - bookmark id
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.delete('/api/bookmarks/:id', authenticationMiddleware, deleteBookmarkHandler(bookmarks));

/**
 * GET /api/collections
 *
 * @tags Collections
 * @summary Get all user collections (actions, bookmarks, and notes)
 *
 * @security BearerAuth
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 */
router.get('/api/collections', authenticationMiddleware, cacheMiddleware(1, 'day'), getCollectionsHandler); // prettier-ignore

/**
 * A note
 * @typedef {object} Note
 * @property {string} title.required - title
 * @property {string} content.required - content
 */

/**
 * GET /api/notes
 *
 * @tags Notes
 * @summary Get all notes
 *
 * @security BearerAuth
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.get('/api/notes', authenticationMiddleware, getNotesHandler(notes));

/**
 * GET /api/notes/{id}
 *
 * @tags Notes
 * @summary Get a specific note
 *
 * @security BearerAuth
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.get('/api/notes/:id', authenticationMiddleware, getNoteHandler(notes));

/**
 * POST /api/notes
 *
 * @tags Notes
 * @summary Create a new note
 *
 * @security BearerAuth
 *
 * @param {object} request.body.required - note info
 *
 * @return {object} 201 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.post('/api/notes', authenticationMiddleware, postNoteHandler.validator, postNoteHandler.handler(notes)); // prettier-ignore

/**
 * PUT /api/notes/{id}
 *
 * @tags Notes
 * @summary Update a note
 *
 * @security BearerAuth
 *
 * @param {string} id.path.required - note id
 * @param {object} request.body.required - note info
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 * @return {object} 404 - Not found response - application/json
 *
 */
router.put('/api/notes/:id', authenticationMiddleware, updateNoteHandler.validator, updateNoteHandler.handler(notes)); // prettier-ignore

/**
 * DELETE /api/notes/{id}
 *
 * @tags Notes
 * @summary Delete a note
 *
 * @security BearerAuth
 *
 * @param {string} id.path.required - note id
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 404 - Not found response - application/json
 *
 */
router.delete('/api/notes/:id', authenticationMiddleware, deleteNoteHandler(notes));

export { router };
