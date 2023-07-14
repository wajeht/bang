import path from 'path';
import express from 'express';
import cors from 'cors';
import compression from 'compression';
import helmet from 'helmet';
const app = express();

import api from './api/api.routes';
import * as appMiddlewares from './app.middlewares';

app.use(cors());
app.use(helmet());
app.use(compression());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.resolve(path.join(process.cwd(), 'public')), { maxAge: '24h' }));

app.use('/api', api);
app.use(appMiddlewares.notFoundHandler);

app.use((req, res, next) => {
	// matching /api/v[number]/
	const isApiPrefix = req.url.match(/\/api\/v\d\//g);

	// console.log(req.url);
	if (isApiPrefix) {
		return res.status(StatusCodes.NOT_FOUND).send({
			message: 'Resource not found',
		});
	}

	next();
});

app.use('*', appMiddlewares.vueHandler);
app.use(appMiddlewares.notFoundHandler);

app.use(appMiddlewares.errorHandler);

export default app;
