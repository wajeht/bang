import express from 'express';

import {
    getNoteHandler,
    getLoginHandler,
    getGithubHandler,
    getLogoutHandler,
    getNotesHandler,
    postNoteHandler,
    getActionsHandler,
    getHealthzHandler,
    postSearchHandler,
    postActionHandler,
    deleteNoteHandler,
    updateNoteHandler,
    getHowToPageHandler,
    updateActionHandler,
    deleteActionHandler,
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
    getPrivacyPolicyPageHandler,
    getHomePageAndSearchHandler,
    getBookmarkCreatePageHandler,
    getTermsOfServicePageHandler,
    getSettingsDisplayPageHandler,
    getSettingsAccountPageHandler,
    postSettingsCreateApiKeyHandler,
    getSettingsDangerZonePageHandler,
    getBookmarkActionCreatePageHandler,
    postDeleteSettingsDangerZoneHandler,
} from './handler';

import {
    csrfMiddleware,
    authenticationMiddleware,
    cacheMiddleware,
    adminOnlyMiddleware,
} from './middleware';

const router = express.Router();

router.get('/healthz', getHealthzHandler);
router.get('/privacy-policy', getPrivacyPolicyPageHandler);
router.get('/', csrfMiddleware, getHomePageAndSearchHandler);
router.get('/terms-of-service', getTermsOfServicePageHandler);
router.get('/how-to', cacheMiddleware(1, 'day'), getHowToPageHandler);

router.get('/login', getLoginHandler);
router.get('/logout', getLogoutHandler);
router.get('/oauth/github', getGithubHandler);
router.post('/search', csrfMiddleware, postSearchHandler);
router.get('/oauth/github/redirect', getGithubRedirectHandler);

router.get('/admin', authenticationMiddleware, adminOnlyMiddleware, csrfMiddleware, getAdminUsersHandler); // prettier-ignore
router.get('/admin/users', authenticationMiddleware, adminOnlyMiddleware, csrfMiddleware, getAdminUsersHandler); // prettier-ignore

router.get('/settings', authenticationMiddleware, getSettingsPageHandler);
router.get('/settings/data', authenticationMiddleware, csrfMiddleware, getSettingsDataPageHandler);
router.get('/settings/display', authenticationMiddleware, csrfMiddleware, getSettingsDisplayPageHandler); // prettier-ignore
router.post('/settings/display', authenticationMiddleware, csrfMiddleware, postSettingsDisplayHandler); // prettier-ignore
router.post('/settings/data/export', authenticationMiddleware, csrfMiddleware, postExportDataHandler); // prettier-ignore
router.post('/settings/data/import', authenticationMiddleware, csrfMiddleware, postImportDataHandler); // prettier-ignore
router.post('/settings/account', authenticationMiddleware, csrfMiddleware, postSettingsAccountHandler); // prettier-ignore
router.get('/settings/account', authenticationMiddleware, csrfMiddleware, getSettingsAccountPageHandler); // prettier-ignore
router.get('/settings/danger-zone', authenticationMiddleware, csrfMiddleware, getSettingsDangerZonePageHandler); // prettier-ignore
router.post('/settings/create-api-key', authenticationMiddleware, csrfMiddleware, postSettingsCreateApiKeyHandler); // prettier-ignore
router.post('/settings/danger-zone/delete', authenticationMiddleware, csrfMiddleware, postDeleteSettingsDangerZoneHandler); // prettier-ignore

router.get('/actions', authenticationMiddleware, csrfMiddleware, getActionsHandler);
router.post('/actions', authenticationMiddleware, csrfMiddleware, postActionHandler);
router.post('/actions/:id/update', authenticationMiddleware, csrfMiddleware, updateActionHandler);
router.post('/actions/:id/delete', authenticationMiddleware, csrfMiddleware, deleteActionHandler);
router.get('/actions/create', authenticationMiddleware, csrfMiddleware, getActionCreatePageHandler);
router.get('/actions/:id/edit', authenticationMiddleware, csrfMiddleware, getEditActionPageHandler);

router.get('/bookmarks/export', authenticationMiddleware, getExportBookmarksHandler);
router.get('/bookmarks', authenticationMiddleware, csrfMiddleware, getBookmarksHandler);
router.post('/bookmarks', authenticationMiddleware, csrfMiddleware, postBookmarkHandler);
router.post('/bookmarks/:id/delete', authenticationMiddleware, csrfMiddleware, deleteBookmarkHandler); // prettier-ignore
router.post('/bookmarks/:id/update', authenticationMiddleware, csrfMiddleware, updateBookmarkHandler); // prettier-ignore
router.get('/bookmarks/:id/edit', authenticationMiddleware, csrfMiddleware,  getEditBookmarkPageHandler); // prettier-ignore
router.get('/bookmarks/create', authenticationMiddleware, csrfMiddleware, getBookmarkCreatePageHandler); // prettier-ignore
router.get('/bookmarks/:id/actions/create', authenticationMiddleware, csrfMiddleware, getBookmarkActionCreatePageHandler); // prettier-ignore

router.get('/notes', authenticationMiddleware, csrfMiddleware, getNotesHandler);
router.post('/notes', authenticationMiddleware, csrfMiddleware, postNoteHandler);
router.post('/notes/:id/update', authenticationMiddleware, csrfMiddleware, updateNoteHandler);
router.post('/notes/:id/delete', authenticationMiddleware, csrfMiddleware, deleteNoteHandler);
router.get('/notes/create', authenticationMiddleware, csrfMiddleware, getNoteCreatePageHandler);
router.get('/notes/:id/edit', authenticationMiddleware, csrfMiddleware, getEditNotePageHandler);
router.get('/notes/:id', authenticationMiddleware, csrfMiddleware, getNoteHandler);

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
router.get('/api/actions', authenticationMiddleware, getActionsHandler);

/**
 *
 * POST /api/actions
 *
 * @tags Actions
 * @summary create a action
 *
 * @param {Action} request.body.required - action info
 *
 * @security BearerAuth
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.post('/api/actions', authenticationMiddleware, postActionHandler);

/**
 *
 * PATCH /api/actions/{id}
 *
 * @tags Actions
 * @summary update a action
 *
 * @param {string} id.path.required - action id
 * @param {Action} request.body.required - action info
 *
 * @security BearerAuth
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.patch('/api/actions/:id', authenticationMiddleware, updateActionHandler);

/**
 *
 * DELETE /api/actions/{id}
 *
 * @tags Actions
 * @summary delete a action
 *
 * @param {string} id.path.required - action id
 *
 * @security BearerAuth
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.delete('/api/actions/:id', authenticationMiddleware, deleteActionHandler);

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
router.get('/api/bookmarks', authenticationMiddleware, getBookmarksHandler);

/**
 *
 * POST /api/bookmarks
 *
 * @tags Bookmarks
 * @summary create a bookmarks
 *
 * @param {Bookmark} request.body.required - bookmark info
 *
 * @security BearerAuth
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.post('/api/bookmarks', authenticationMiddleware, postBookmarkHandler);

/**
 *
 * PATCH /api/bookmarks/{id}
 *
 * @tags Bookmarks
 * @summary update a bookmarks
 *
 * @param {number} id.path.required - bookmark id
 * @param {Bookmark} request.body.required - bookmark info
 *
 * @security BearerAuth
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.patch('/api/bookmarks/:id', authenticationMiddleware, updateBookmarkHandler);

/**
 *
 * DELETE /api/bookmarks/{id}
 *
 * @tags Bookmarks
 * @summary delete a bookmark
 *
 * @param {string} id.path.required - bookmark id
 *
 * @security BearerAuth
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.delete('/api/bookmarks/:id', authenticationMiddleware, deleteBookmarkHandler);

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
 * @tags Notes
 * @summary Get all notes
 * @security BearerAuth
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 */
router.get('/api/notes', authenticationMiddleware, getNotesHandler);

/**
 * GET /api/notes/{id}
 * @tags Notes
 * @summary Get a specific note
 * @security BearerAuth
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 */
router.get('/api/notes/:id', authenticationMiddleware, getNoteHandler);

/**
 * POST /api/notes
 * @tags Notes
 * @summary Create a new note
 * @security BearerAuth
 * @param {object} request.body.required - note info
 * @return {object} 201 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 */
router.post('/api/notes', authenticationMiddleware, postNoteHandler);

/**
 * PUT /api/notes/{id}
 * @tags Notes
 * @summary Update a note
 * @security BearerAuth
 * @param {string} id.path.required - note id
 * @param {object} request.body.required - note info
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 * @return {object} 404 - Not found response - application/json
 */
router.put('/api/notes/:id', authenticationMiddleware, updateNoteHandler);

/**
 * DELETE /api/notes/{id}
 * @tags Notes
 * @summary Delete a note
 * @security BearerAuth
 * @param {string} id.path.required - note id
 * @return {object} 200 - success response - application/json
 * @return {object} 404 - Not found response - application/json
 */
router.delete('/api/notes/:id', authenticationMiddleware, deleteNoteHandler);

export { router };
