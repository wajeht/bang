import express from 'express';

import {
	apiKeyOnlyAuthenticationMiddleware,
	authenticationMiddleware,
	csrfMiddleware,
} from './middlewares';

import {
	getActionsHandler,
	getGithubHandler,
	getGithubRedirectHandler,
	getHealthzHandler,
	getHomePageAndSearchHandler,
	getLoginHandler,
	getLogoutHandler,
	postActionHandler,
	getPrivacyPolicyPageHandler,
	getActionCreatePageHandler,
	getTermsOfServicePageHandler,
	getBookmarksPageHandler,
	postDeleteBookmarkHandler,
	deleteActionHandler,
	getEditActionPageHandler,
	updateActionHandler,
	getSettingsPageHandler,
	getSettingsDangerZonePageHandler,
	getSettingsDataPageHandler,
	getSettingsAccountPageHandler,
	postDeleteSettingsDangerZoneHandler,
	postSettingsAccountHandler,
	getExportBookmarksHandler,
	postSearchHandler,
	postExportDataHandler,
	postImportDataHandler,
	getEditBookmarkPageHandler,
	postUpdateBookmarkHandler,
	getBookmarkActionCreatePageHandler,
	getBookmarkCreatePageHandler,
	postBookmarkHandler,
	postSettingsCreateApiKeyHandler,
} from './handlers';

const router = express.Router();

/**
 *
 * Web Routes
 * These routes are typically for rendering pages and handling non-API actions
 *
 */

router.get('/', csrfMiddleware, getHomePageAndSearchHandler);
router.post('/search', authenticationMiddleware, csrfMiddleware, postSearchHandler);
router.get('/healthz', getHealthzHandler);
router.get('/terms-of-service', getTermsOfServicePageHandler);
router.get('/privacy-policy', getPrivacyPolicyPageHandler);

router.get('/logout', getLogoutHandler);
router.get('/login', getLoginHandler);
router.get('/oauth/github', getGithubHandler);
router.get('/oauth/github/redirect', getGithubRedirectHandler);

router.get('/settings', authenticationMiddleware, getSettingsPageHandler);
router.get('/settings/account', authenticationMiddleware, csrfMiddleware, getSettingsAccountPageHandler); // prettier-ignore
router.post('/settings/create-api-key', authenticationMiddleware, csrfMiddleware, postSettingsCreateApiKeyHandler); // prettier-ignore
router.post('/settings/account', authenticationMiddleware, csrfMiddleware, postSettingsAccountHandler); // prettier-ignore
router.get('/settings/data', authenticationMiddleware, csrfMiddleware, getSettingsDataPageHandler);
router.get('/settings/danger-zone', authenticationMiddleware, csrfMiddleware, getSettingsDangerZonePageHandler); // prettier-ignore
router.post('/settings/danger-zone/delete', authenticationMiddleware, csrfMiddleware, postDeleteSettingsDangerZoneHandler); // prettier-ignore
router.post('/settings/data/export', authenticationMiddleware, csrfMiddleware, postExportDataHandler); // prettier-ignore
router.post('/settings/data/import', authenticationMiddleware, csrfMiddleware, postImportDataHandler); // prettier-ignore

router.get('/actions', authenticationMiddleware, csrfMiddleware, getActionsHandler);
router.post('/actions', authenticationMiddleware, csrfMiddleware, postActionHandler);
router.get('/actions/create', authenticationMiddleware, csrfMiddleware, getActionCreatePageHandler);
router.get('/actions/:id/edit', authenticationMiddleware, csrfMiddleware, getEditActionPageHandler);
router.post('/actions/:id/update', authenticationMiddleware, csrfMiddleware, updateActionHandler);
router.post('/actions/:id/delete', authenticationMiddleware, csrfMiddleware, deleteActionHandler);

router.post('/bookmarks', authenticationMiddleware, csrfMiddleware, postBookmarkHandler);
router.get('/bookmarks', authenticationMiddleware, csrfMiddleware, getBookmarksPageHandler);
router.post('/bookmarks/:id/delete', authenticationMiddleware, csrfMiddleware, postDeleteBookmarkHandler); // prettier-ignore
router.post('/bookmarks/:id/update', authenticationMiddleware, csrfMiddleware, postUpdateBookmarkHandler); // prettier-ignore
router.get('/bookmarks/:id/edit', authenticationMiddleware, csrfMiddleware,  getEditBookmarkPageHandler); // prettier-ignore
router.get('/bookmarks/:id/actions/create', authenticationMiddleware, csrfMiddleware, getBookmarkActionCreatePageHandler); // prettier-ignore
router.get('/bookmarks/create', authenticationMiddleware, csrfMiddleware, getBookmarkCreatePageHandler); // prettier-ignore
router.get('/bookmarks/export', authenticationMiddleware, getExportBookmarksHandler);

/**
 *
 * API Routes
 * These routes are specifically for API requests and require API key authentication
 *
 */
router.get('/api/actions', apiKeyOnlyAuthenticationMiddleware, getActionsHandler);
router.post('/api/actions', apiKeyOnlyAuthenticationMiddleware, postActionHandler);
router.patch('/api/actions/:id', apiKeyOnlyAuthenticationMiddleware, updateActionHandler);
router.delete('/api/actions/:id', apiKeyOnlyAuthenticationMiddleware, deleteActionHandler);

// router.post('/api/bookmarks', apiKeyOnlyAuthenticationMiddleware, postBookmarkHandler);
// router.get('/api/bookmarks', apiKeyOnlyAuthenticationMiddleware, getBookmarksPageHandler);
// router.patch('/api/bookmarks/:id', apiKeyOnlyAuthenticationMiddleware, postUpdateBookmarkHandler);
// router.delete('/api/bookmarks/:id', apiKeyOnlyAuthenticationMiddleware, postDeleteBookmarkHandler);

export { router };
