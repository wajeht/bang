import express from 'express';

import {
	getGithub,
	getGithubRedirect,
	getHealthzHandler,
	getHomePageHandler,
	getLoginHandler,
	getPrivacyPolicyPageHandler,
	getTermsOfServicePageHandler,
} from './handlers';

const router = express.Router();

router.get('/', getHomePageHandler);

router.get('/healthz', getHealthzHandler);

router.get('/terms-of-service', getTermsOfServicePageHandler);

router.get('/privacy-policy', getPrivacyPolicyPageHandler);

router.get('/login', getLoginHandler);

router.get('/oauth/github', getGithub);

router.get('/oauth/github/redirect', getGithubRedirect);

export { router };
