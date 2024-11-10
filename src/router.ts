import express from 'express';

import {
	getGithubHandler,
	getGithubRedirect,
	getHealthzHandler,
	getHomePageHandler,
	getLoginHandler,
	getLogoutHandler,
	getPrivacyPolicyPageHandler,
	getTermsOfServicePageHandler,
} from './handlers';

const router = express.Router();

router.get('/', getHomePageHandler);

router.get('/healthz', getHealthzHandler);

router.get('/terms-of-service', getTermsOfServicePageHandler);

router.get('/privacy-policy', getPrivacyPolicyPageHandler);

router.get('/logout', getLogoutHandler);

router.get('/login', getLoginHandler);

router.get('/oauth/github', getGithubHandler);

router.get('/oauth/github/redirect', getGithubRedirect);

export { router };
