import express from 'express';

import {
	getDashboardPageHandler,
	getGithubHandler,
	getGithubRedirect,
	getHealthzHandler,
	getHomePageHandler,
	getLoginHandler,
	getLogoutHandler,
	getSearchHandler,
	getPrivacyPolicyPageHandler,
	getTermsOfServicePageHandler,
} from './handlers';
import { authenticationMiddleware } from 'middlewares';

const router = express.Router();

router.get('/', getHomePageHandler);

router.get('/healthz', getHealthzHandler);

router.get('/terms-of-service', getTermsOfServicePageHandler);

router.get('/privacy-policy', getPrivacyPolicyPageHandler);

router.get('/logout', getLogoutHandler);

router.get('/login', getLoginHandler);

router.get('/oauth/github', getGithubHandler);

router.get('/oauth/github/redirect', getGithubRedirect);

router.get('/dashboard', authenticationMiddleware, getDashboardPageHandler);

router.get('/search', authenticationMiddleware, getSearchHandler);

export { router };
