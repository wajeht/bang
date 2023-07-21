import path from 'path';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
const app = express();

import env from './configs/env';
import api from './api/api.routes';
import * as appMiddlewares from './app.middlewares';

app.use(
	helmet({
		contentSecurityPolicy: {
			useDefaults: true,
			directives: {
				'script-src': ["'self'", 'https://plausible.jaw.dev'],
			},
		},
	}),
);

app.use(
	cors({
		origin: [
			`http://localhost:${env.VUE_PORT}`,
			`http://localhost:${env.SERVER_PORT}`,
			'https://bang.jaw.dev',
		],
		credentials: true,
	}),
);

app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve(path.join(process.cwd(), 'public')), { maxAge: '24h' }));

app.use('/api', api);

app.use(appMiddlewares.apiNotFoundHandle);

app.use('*', appMiddlewares.vueHandler);

app.use(appMiddlewares.notFoundHandler);
app.use(appMiddlewares.errorHandler);

export default app;
