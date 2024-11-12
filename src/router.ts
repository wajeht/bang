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
	deleteBookmarkHandler,
	deleteActionHandler,
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

router.get('/actions', authenticationMiddleware, getActionsPageHandler);

router.post('/actions', authenticationMiddleware, postActionHandler);

router.post('/actions/:id', authenticationMiddleware, deleteActionHandler);

router.get('/actions/create', authenticationMiddleware, getActionCreatePageHandler);

router.get('/bookmarks', authenticationMiddleware, getBookmarksPageHandler);

router.post('/bookmarks/:id', authenticationMiddleware, deleteBookmarkHandler);

export { router };
