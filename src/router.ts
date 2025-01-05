import express from 'express';

import {
	csrfMiddleware,
	authenticationMiddleware,
	apiKeyOnlyAuthenticationMiddleware,
} from './middlewares';

import {
	getLoginHandler,
	getGithubHandler,
	getLogoutHandler,
	getActionsHandler,
	getHealthzHandler,
	postSearchHandler,
	postActionHandler,
	updateActionHandler,
	deleteActionHandler,
	getBookmarksHandler,
	postBookmarkHandler,
	postExportDataHandler,
	postImportDataHandler,
	deleteBookmarkHandler,
	updateBookmarkHandler,
	getSettingsPageHandler,
	getGithubRedirectHandler,
	getEditActionPageHandler,
	getExportBookmarksHandler,
	getEditBookmarkPageHandler,
	getActionCreatePageHandler,
	getSettingsDataPageHandler,
	postSettingsAccountHandler,
	getPrivacyPolicyPageHandler,
	getHomePageAndSearchHandler,
	getBookmarkCreatePageHandler,
	getTermsOfServicePageHandler,
	getSettingsAccountPageHandler,
	postSettingsCreateApiKeyHandler,
	getSettingsDangerZonePageHandler,
	getBookmarkActionCreatePageHandler,
	postDeleteSettingsDangerZoneHandler,
} from './handlers';

const router = express.Router();

router.get('/healthz', getHealthzHandler);
router.get('/privacy-policy', getPrivacyPolicyPageHandler);
router.get('/', csrfMiddleware, getHomePageAndSearchHandler);
router.get('/terms-of-service', getTermsOfServicePageHandler);

router.get('/login', getLoginHandler);
router.get('/logout', getLogoutHandler);
router.get('/oauth/github', getGithubHandler);
router.get('/oauth/github/redirect', getGithubRedirectHandler);
router.post('/search', authenticationMiddleware, csrfMiddleware, postSearchHandler);

router.get('/settings', authenticationMiddleware, getSettingsPageHandler);
router.get('/settings/data', authenticationMiddleware, csrfMiddleware, getSettingsDataPageHandler);
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

/**
 *
 * GET /api/actions
 *
 * @tags actions
 * @summary get actions
 *
 * @security BearerAuth
 *
 * @return {array<object>} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.get('/api/actions', apiKeyOnlyAuthenticationMiddleware, getActionsHandler);

/**
 *
 * POST /api/actions
 *
 * @tags actions
 * @summary create a action
 *
 * @param {string} url.form.required - url - application/json
 * @param {string} name.form.required - name - application/json
 * @param {string} actionType.form.required - actionType - application/json
 * @param {string} trigger.form.required - trigger - application/json
 *
 * @security BearerAuth
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.post('/api/actions', apiKeyOnlyAuthenticationMiddleware, postActionHandler);

/**
 *
 * PATCH /api/actions/{id}
 *
 * @tags actions
 * @summary update a action
 *
 * @param {string} id.path.required - action id
 *
 * @param {string} url.form.required - url - application/json
 * @param {string} name.form.required - name - application/json
 * @param {string} actionType.form.required - actionType - application/json
 * @param {string} trigger.form.required - trigger - application/json
 *
 * @security BearerAuth
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.patch('/api/actions/:id', apiKeyOnlyAuthenticationMiddleware, updateActionHandler);

/**
 *
 * DELETE /api/actions/{id}
 *
 * @tags actions
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
router.delete('/api/actions/:id', apiKeyOnlyAuthenticationMiddleware, deleteActionHandler);

/**
 *
 * GET /api/bookmarks
 *
 * @tags bookmarks
 * @summary get bookmarks
 *
 * @security BearerAuth
 *
 * @return {array<object>} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.get('/api/bookmarks', apiKeyOnlyAuthenticationMiddleware, getBookmarksHandler);

/**
 *
 * POST /api/bookmarks
 *
 * @tags bookmarks
 * @summary create a bookmarks
 *
 * @param {number} id.path.required - bookmark id
 *
 * @param {string} url.form.required - url - application/json
 * @param {string} title.form.required - title - application/json
 *
 * @security BearerAuth
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.post('/api/bookmarks', apiKeyOnlyAuthenticationMiddleware, postBookmarkHandler);

/**
 *
 * PATCH /api/bookmarks/{id}
 *
 * @tags bookmarks
 * @summary update a bookmarks
 *
 * @param {number} id.path.required - bookmark id
 *
 * @param {string} url.form.required - url - application/json
 * @param {string} title.form.required - title - application/json
 *
 * @security BearerAuth
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.patch('/api/bookmarks/:id', apiKeyOnlyAuthenticationMiddleware, updateBookmarkHandler);

/**
 *
 * DELETE /api/bookmarks/{id}
 *
 * @tags bookmarks
 * @summary delete a bookmark
 * @param {string} id.path.required - bookmark id
 *
 * @security BearerAuth
 *
 * @return {object} 200 - success response - application/json
 * @return {object} 400 - Bad request response - application/json
 *
 */
router.delete('/api/bookmarks/:id', apiKeyOnlyAuthenticationMiddleware, deleteBookmarkHandler);

export { router };
