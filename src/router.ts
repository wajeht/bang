import express from 'express';

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
} from './handlers';
import { authenticationMiddleware, csrfMiddleware } from './middlewares';

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

router.get('/bookmarks', authenticationMiddleware, csrfMiddleware, getBookmarksPageHandler);
router.post('/bookmarks/:id/delete', authenticationMiddleware, csrfMiddleware, postDeleteBookmarkHandler); // prettier-ignore
router.get('/bookmarks/export', authenticationMiddleware, getExportBookmarksHandler);

router.post(
	'/settings/data/export',
	authenticationMiddleware,
	csrfMiddleware,
	postExportDataHandler,
);
router.post(
	'/settings/data/import',
	authenticationMiddleware,
	csrfMiddleware,
	postImportDataHandler,
);

export { router };
