import path from 'path';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
const app = express();

import env from './configs/env';
import api from './api/api.routes';
import * as appMiddlewares from './app.middlewares';
import * as apiMiddlewares from './api/api.middlewares';

app.use(
	helmet.contentSecurityPolicy({
		directives: {
			...helmet.contentSecurityPolicy.getDefaultDirectives(),
			'default-src': ["'self'", 'plausible.jaw.dev'],
			'script-src': ["'self'", "'unsafe-inline'", 'plausible.jaw.dev'],
		},
	}),
);

app.use(cors());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser(env.COOKIE_SECRET));
app.use(express.static(path.resolve(path.join(process.cwd(), 'public')), { maxAge: '24h' }));

app.use('/api', api);
app.use(appMiddlewares.apiNotFoundHandle);

app.use('/dashboard*', apiMiddlewares.checkAuth);

app.use('*', appMiddlewares.vueHandler);

app.use(appMiddlewares.notFoundHandler);
app.use(appMiddlewares.errorHandler);

export default app;
