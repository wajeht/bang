import ejs from 'ejs';
import cors from 'cors';
import path from 'node:path';
import express from 'express';
import flash from 'connect-flash';
import { appConfig } from './configs';
import compression from 'compression';
import expressLayouts from 'express-ejs-layouts';
import { router } from './router';
import {
	errorMiddleware,
	notFoundMiddleware,
	helmetMiddleware,
	sessionMiddleware,
	appLocalStateMiddleware,
} from './middlewares';

const app = express();

app.set('trust proxy', 1);

app.use(sessionMiddleware());

app.use(flash());

app.use(compression());

app.use(cors());

app.use(helmetMiddleware());

app.use(express.json({ limit: '100kb' }));

app.use(express.urlencoded({ extended: true, limit: '100kb' }));

app.use(
	express.static(path.join(process.cwd(), 'public'), {
		maxAge: '30d',
		etag: true,
		lastModified: true,
	}),
);

app.engine('html', ejs.renderFile);

app.set('view engine', 'html');

app.set('view cache', appConfig.env === 'production');

app.set('views', path.join(process.cwd(), 'src', 'views', 'pages'));

app.set('layout', path.join(process.cwd(), 'src', 'views', 'layouts', 'public.html'));

app.use(expressLayouts);

app.use(appLocalStateMiddleware);

app.use(router);

app.use(notFoundMiddleware());

app.use(errorMiddleware());

export { app };
