import express from 'express';
import { marked } from 'marked';
import { logger } from './logger';

import {
    getNoteHandler,
    getLogoutHandler,
    getNotesHandler,
    postNoteHandler,
    postLoginHandler,
    getActionHandler,
    getActionsHandler,
    getHealthzHandler,
    postSearchHandler,
    postActionHandler,
    deleteNoteHandler,
    updateNoteHandler,
    getBookmarkHandler,
    getMagicLinkHandler,
    getHowToPageHandler,
    updateActionHandler,
    deleteActionHandler,
    getBookmarksHandler,
    postBookmarkHandler,
    toggleNotePinHandler,
    getAdminUsersHandler,
    postExportDataHandler,
    postImportDataHandler,
    deleteBookmarkHandler,
    updateBookmarkHandler,
    getCollectionsHandler,
    getSettingsPageHandler,
    getEditNotePageHandler,
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
    postNotesRenderMarkdownHandler,
    postSettingsCreateApiKeyHandler,
    getSettingsDangerZonePageHandler,
    getBookmarkActionCreatePageHandler,
    postDeleteSettingsDangerZoneHandler,
} from './handler';

import { cacheMiddleware, adminOnlyMiddleware, authenticationMiddleware } from './middleware';

import { db } from './db/db';
import { api } from './util';
import { search } from './search';
import { actions, bookmarks, notes } from './repository';

const router = express.Router();

router.get('/healthz', getHealthzHandler(db));
router.get('/', getHomePageAndSearchHandler(search));
router.get('/how-to', cacheMiddleware(30, 'day'), getHowToPageHandler());
router.get('/privacy-policy', cacheMiddleware(30, 'day'), getPrivacyPolicyPageHandler());
router.get('/terms-of-service', cacheMiddleware(30, 'day'), getTermsOfServicePageHandler());

router.post('/login', postLoginHandler());
router.get('/logout', getLogoutHandler());
router.post('/search', postSearchHandler(search));
router.get('/auth/magic/:token', getMagicLinkHandler());

router.get('/admin', authenticationMiddleware, adminOnlyMiddleware, getAdminUsersHandler(db));
router.get('/admin/users', authenticationMiddleware, adminOnlyMiddleware, getAdminUsersHandler(db)); // prettier-ignore
router.post('/admin/users/:id/delete', authenticationMiddleware, adminOnlyMiddleware, postDeleteAdminUserHandler(db)); // prettier-ignore

router.get('/settings', authenticationMiddleware, getSettingsPageHandler());
router.get('/settings/data', authenticationMiddleware, getSettingsDataPageHandler());
router.post('/settings/data/import', authenticationMiddleware, postImportDataHandler(db));
router.post('/settings/account', authenticationMiddleware, postSettingsAccountHandler(db));
router.post('/settings/display', authenticationMiddleware, postSettingsDisplayHandler(db));
router.get('/settings/account', authenticationMiddleware, getSettingsAccountPageHandler());
router.post('/settings/data/export', authenticationMiddleware, postExportDataHandler(db, logger));
router.get('/settings/danger-zone', authenticationMiddleware, getSettingsDangerZonePageHandler());
router.post('/settings/create-api-key', authenticationMiddleware, postSettingsCreateApiKeyHandler(db, api)); // prettier-ignore
router.post('/settings/danger-zone/delete', authenticationMiddleware, postDeleteSettingsDangerZoneHandler(db)); // prettier-ignore

router.get('/actions', authenticationMiddleware, getActionsHandler(actions));
router.post('/actions', authenticationMiddleware, postActionHandler(actions));
router.get('/actions/create', authenticationMiddleware, getActionCreatePageHandler());
router.get('/actions/:id/edit', authenticationMiddleware, getEditActionPageHandler(db));
router.post('/actions/:id/delete', authenticationMiddleware, deleteActionHandler(actions));
router.post('/actions/:id/update', authenticationMiddleware, updateActionHandler(actions));

router.post('/bookmarks', authenticationMiddleware, postBookmarkHandler());
router.get('/bookmarks', authenticationMiddleware, getBookmarksHandler(bookmarks));
router.get('/bookmarks/export', authenticationMiddleware, getExportBookmarksHandler(db));
router.get('/bookmarks/create', authenticationMiddleware, getBookmarkCreatePageHandler());
router.post('/bookmarks/:id/delete', authenticationMiddleware, deleteBookmarkHandler(bookmarks));
router.get('/bookmarks/:id/edit', authenticationMiddleware, getEditBookmarkPageHandler(bookmarks));
router.post('/bookmarks/:id/update', authenticationMiddleware, updateBookmarkHandler(bookmarks));
router.get('/bookmarks/:id/actions/create', authenticationMiddleware, getBookmarkActionCreatePageHandler(db)); // prettier-ignore

router.get('/notes', authenticationMiddleware, getNotesHandler(notes));
router.post('/notes', authenticationMiddleware, postNoteHandler(notes));
router.get('/notes/create', authenticationMiddleware, getNoteCreatePageHandler());
router.post('/notes/:id/update', authenticationMiddleware, updateNoteHandler(notes));
router.post('/notes/:id/delete', authenticationMiddleware, deleteNoteHandler(notes));
router.post('/notes/:id/pin', authenticationMiddleware, toggleNotePinHandler(notes));
router.get('/notes/:id/edit', authenticationMiddleware, getEditNotePageHandler(notes));
router.get('/notes/:id', authenticationMiddleware, getNoteHandler(notes, marked, logger));

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

/**
 * A action
 * @typedef {object} Action
 * @property {string} id - action id
 * @property {string} url.required - action url
 * @property {string} name.required - action name
 * @property {string} actionType.required - action type (e.g., webhook, email)
 * @property {string} trigger.required - trigger condition
 * @property {string} createdAt - creation timestamp
 * @property {string} updatedAt - last update timestamp
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
 * @return {array<Action>} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 * @example response - 200 - success response example
 * [
 *   {
 *     "id": "1",
 *     "url": "https://webhook.example.com",
 *     "name": "Webhook Action",
 *     "actionType": "webhook",
 *     "trigger": "bookmark_created",
 *     "createdAt": "2023-01-01T00:00:00Z",
 *     "updatedAt": "2023-01-01T00:00:00Z"
 *   }
 * ]
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
 * @return {Action} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 * @return {object} 404 - Not found response - application/json
 *
 */
router.get('/api/actions/:id', authenticationMiddleware, getActionHandler(actions));

/**
 *
 * POST /api/actions
 *
 * @tags Actions
 * @summary create an action
 *
 * @security BearerAuth
 *
 * @param {Action} request.body.required - action info
 *
 * @return {object} 201 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.post('/api/actions', authenticationMiddleware, postActionHandler(actions));

/**
 *
 * PATCH /api/actions/{id}
 *
 * @tags Actions
 * @summary update an action
 *
 * @security BearerAuth
 *
 * @param {string} id.path.required - action id
 * @param {Action} request.body.required - action info
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 * @return {object} 404 - Not found response - application/json
 *
 */
router.patch('/api/actions/:id', authenticationMiddleware, updateActionHandler(actions));

/**
 *
 * DELETE /api/actions/{id}
 *
 * @tags Actions
 * @summary delete an action
 *
 * @security BearerAuth
 *
 * @param {string} id.path.required - action id
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 * @return {object} 404 - Not found response - application/json
 *
 */
router.delete('/api/actions/:id', authenticationMiddleware, deleteActionHandler(actions));

/**
 * A bookmark
 * @typedef {object} Bookmark
 * @property {number} id - bookmark id
 * @property {string} url.required - bookmark url
 * @property {string} title.required - bookmark title
 * @property {string} description - bookmark description
 * @property {array<string>} tags - bookmark tags
 * @property {string} createdAt - creation timestamp
 * @property {string} updatedAt - last update timestamp
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
 * @return {array<Bookmark>} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 * @example response - 200 - success response example
 * [
 *   {
 *     "id": 1,
 *     "url": "https://example.com",
 *     "title": "Example Website",
 *     "description": "A sample bookmark",
 *     "tags": ["web", "example"],
 *     "createdAt": "2023-01-01T00:00:00Z",
 *     "updatedAt": "2023-01-01T00:00:00Z"
 *   }
 * ]
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
 * @return {Bookmark} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 * @return {object} 404 - Not found response - application/json
 *
 */
router.get('/api/bookmarks/:id', authenticationMiddleware, getBookmarkHandler(bookmarks));

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
router.post('/api/bookmarks', authenticationMiddleware, postBookmarkHandler());

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
router.patch('/api/bookmarks/:id', authenticationMiddleware, updateBookmarkHandler(bookmarks));

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
 * @property {string} id - note id
 * @property {string} title.required - note title
 * @property {string} content.required - note content
 * @property {array<string>} tags - note tags
 * @property {string} createdAt - creation timestamp
 * @property {string} updatedAt - last update timestamp
 */

/**
 * A note request body
 * @typedef {object} NoteRequestBody
 * @property {string} content.required - markdown content to render
 */

/**
 * GET /api/notes
 *
 * @tags Notes
 * @summary Get all notes
 *
 * @security BearerAuth
 *
 * @return {array<Note>} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 * @example response - 200 - success response example
 * [
 *   {
 *     "id": "1",
 *     "title": "My First Note",
 *     "content": "This is the content of my first note",
 *     "tags": ["personal", "important"],
 *     "createdAt": "2023-01-01T00:00:00Z",
 *     "updatedAt": "2023-01-01T00:00:00Z"
 *   }
 * ]
 */
router.get('/api/notes', authenticationMiddleware, getNotesHandler(notes));

/**
 * POST /api/notes/render-markdown
 *
 * @tags Notes
 * @summary Render markdown content to html
 *
 * @security BearerAuth
 *
 * @param {NoteRequestBody} request.body.required - request body
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 * @return {object} 404 - Not found response - application/json
 */
router.post('/api/notes/render-markdown', authenticationMiddleware, postNotesRenderMarkdownHandler(marked)); // prettier-ignore

/**
 * GET /api/notes/{id}
 *
 * @tags Notes
 * @summary Get a specific note
 *
 * @security BearerAuth
 *
 * @param {string} id.path.required - note id
 *
 * @return {Note} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 * @return {object} 404 - Not found response - application/json
 *
 */
router.get('/api/notes/:id', authenticationMiddleware, getNoteHandler(notes, marked, logger));

/**
 * POST /api/notes
 *
 * @tags Notes
 * @summary Create a new note
 *
 * @security BearerAuth
 *
 * @param {Note} request.body.required - note info
 *
 * @return {object} 201 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.post('/api/notes', authenticationMiddleware, postNoteHandler(notes));

/**
 * PUT /api/notes/{id}
 *
 * @tags Notes
 * @summary Update a note
 *
 * @security BearerAuth
 *
 * @param {string} id.path.required - note id
 * @param {Note} request.body.required - note info
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 * @return {object} 404 - Not found response - application/json
 *
 */
router.put('/api/notes/:id', authenticationMiddleware, updateNoteHandler(notes));

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

/**
 * POST /api/notes/{id}/pin
 *
 * @tags Notes
 * @summary Toggle pin status of a note
 *
 * @security BearerAuth
 *
 * @param {string} id.path.required - note id
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 404 - Not found response - application/json
 *
 */
router.post('/api/notes/:id/pin', authenticationMiddleware, toggleNotePinHandler(notes));

export { router };
