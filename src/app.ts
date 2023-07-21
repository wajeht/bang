import path from 'path';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
const app = express();

import api from './api/api.routes';
import * as appMiddlewares from './app.middlewares';

app.use(
	helmet({
		contentSecurityPolicy: {
			directives: {
        'default-src': "'self'",
				'script-src': ["'self'", 'https://plausible.jaw.dev'],
			},
		},
	}),
);
app.use(cors());
app.set('trust proxy', true);
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
