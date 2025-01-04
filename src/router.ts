import express from 'express';

import {
	apiKeyOnlyAuthenticationMiddleware,
	authenticationMiddleware,
	csrfMiddleware,
} from './middlewares';

import {
	getActionsPageHandler,
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
	postDeleteActionHandler,
	getEditActionPageHandler,
	postUpdateActionHandler,
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

router.get('/actions', authenticationMiddleware, csrfMiddleware, getActionsPageHandler);
router.post('/actions', authenticationMiddleware, csrfMiddleware, postActionHandler);
router.get('/actions/create', authenticationMiddleware, csrfMiddleware, getActionCreatePageHandler);

router.get('/actions/:id/edit', authenticationMiddleware, csrfMiddleware, getEditActionPageHandler);
router.post('/actions/:id/update', authenticationMiddleware, csrfMiddleware, postUpdateActionHandler); // prettier-ignore
router.post('/actions/:id/delete', authenticationMiddleware, csrfMiddleware, postDeleteActionHandler); // prettier-ignore

router.post('/bookmarks', authenticationMiddleware, csrfMiddleware, postBookmarkHandler);
router.get('/bookmarks', authenticationMiddleware, csrfMiddleware, getBookmarksPageHandler);
router.post('/bookmarks/:id/delete', authenticationMiddleware, csrfMiddleware, postDeleteBookmarkHandler); // prettier-ignore
router.post('/bookmarks/:id/update', authenticationMiddleware, csrfMiddleware, postUpdateBookmarkHandler); // prettier-ignore
router.get('/bookmarks/:id/edit', authenticationMiddleware, csrfMiddleware,  getEditBookmarkPageHandler); // prettier-ignore
router.get('/bookmarks/:id/actions/create', authenticationMiddleware, csrfMiddleware, getBookmarkActionCreatePageHandler); // prettier-ignore
router.get('/bookmarks/create', authenticationMiddleware, csrfMiddleware, getBookmarkCreatePageHandler); // prettier-ignore
router.get('/bookmarks/export', authenticationMiddleware, getExportBookmarksHandler);

router.post('/settings/data/export', authenticationMiddleware, csrfMiddleware, postExportDataHandler); // prettier-ignore
router.post('/settings/data/import', authenticationMiddleware, csrfMiddleware, postImportDataHandler); // prettier-ignore

router.get('/api/actions', apiKeyOnlyAuthenticationMiddleware, getActionsPageHandler);
router.post('/api/actions', apiKeyOnlyAuthenticationMiddleware, postActionHandler);
router.patch('/api/actions/:id', apiKeyOnlyAuthenticationMiddleware, postUpdateActionHandler);
router.delete('/api/actions/:id', apiKeyOnlyAuthenticationMiddleware, postDeleteActionHandler);

router.post('/api/bookmarks', apiKeyOnlyAuthenticationMiddleware, postBookmarkHandler);
router.get('/api/bookmarks', apiKeyOnlyAuthenticationMiddleware, getBookmarksPageHandler);
router.patch('/api/bookmarks/:id', apiKeyOnlyAuthenticationMiddleware, postUpdateBookmarkHandler);
router.delete('/api/bookmarks/:id', apiKeyOnlyAuthenticationMiddleware, postDeleteBookmarkHandler);

export { router };
