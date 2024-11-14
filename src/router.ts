import express from 'express';

import {
	getActionsPageHandler,
	getGithubHandler,
	getGithubRedirect,
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
} from './handlers';
import { authenticationMiddleware, csrfMiddleware } from './middlewares';

const router = express.Router();

router.get('/', getHomePageAndSearchHandler);
router.get('/healthz', getHealthzHandler);
router.get('/terms-of-service', getTermsOfServicePageHandler);
router.get('/privacy-policy', getPrivacyPolicyPageHandler);

router.get('/logout', getLogoutHandler);
router.get('/login', getLoginHandler);

router.get('/oauth/github', getGithubHandler);
router.get('/oauth/github/redirect', getGithubRedirect);

router.get('/settings', authenticationMiddleware, getSettingsPageHandler);
router.get(
	'/settings/account',
	authenticationMiddleware,
	csrfMiddleware,
	getSettingsAccountPageHandler,
);
router.post(
	'/settings/account',
	authenticationMiddleware,
	csrfMiddleware,
	postSettingsAccountHandler,
);
router.get('/settings/data', authenticationMiddleware, getSettingsDataPageHandler);
router.get(
	'/settings/danger-zone',
	authenticationMiddleware,
	csrfMiddleware,
	getSettingsDangerZonePageHandler,
);
router.post('/settings/danger-zone/delete', authenticationMiddleware, csrfMiddleware, postDeleteSettingsDangerZoneHandler); // prettier-ignore

router.get('/actions', authenticationMiddleware, csrfMiddleware, getActionsPageHandler);
router.post('/actions', authenticationMiddleware, csrfMiddleware, postActionHandler);
router.get('/actions/create', authenticationMiddleware, csrfMiddleware, getActionCreatePageHandler);

router.get('/actions/:id/edit', authenticationMiddleware, csrfMiddleware, getEditActionPageHandler);
router.post(
	'/actions/:id/update',
	authenticationMiddleware,
	csrfMiddleware,
	postUpdateActionHandler,
);
router.post(
	'/actions/:id/delete',
	authenticationMiddleware,
	csrfMiddleware,
	postDeleteActionHandler,
);

router.get('/bookmarks', authenticationMiddleware, csrfMiddleware, getBookmarksPageHandler);
router.post(
	'/bookmarks/:id/delete',
	authenticationMiddleware,
	csrfMiddleware,
	postDeleteBookmarkHandler,
);

export { router };
