import express from 'express';

import {
	getDashboardPageHandler,
	getGithubHandler,
	getGithubRedirect,
	getHealthzHandler,
	getHomePageAndSearchHandler,
	getLoginHandler,
	getLogoutHandler,
	getPrivacyPolicyPageHandler,
	getTermsOfServicePageHandler,
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

router.get('/dashboard', authenticationMiddleware, getDashboardPageHandler);

export { router };
