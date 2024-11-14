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
} from './handlers';
import { authenticationMiddleware } from './middlewares';

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

router.get('/actions', authenticationMiddleware, getActionsPageHandler);
router.post('/actions', authenticationMiddleware, postActionHandler);
router.get('/actions/create', authenticationMiddleware, getActionCreatePageHandler);

router.get('/actions/:id/edit', authenticationMiddleware, getEditActionPageHandler);
router.post('/actions/:id/update', authenticationMiddleware, postUpdateActionHandler);
router.post('/actions/:id/delete', authenticationMiddleware, postDeleteActionHandler);

router.get('/bookmarks', authenticationMiddleware, getBookmarksPageHandler);
router.post('/bookmarks/:id/delete', authenticationMiddleware, postDeleteBookmarkHandler);

export { router };
