import {
    csrfMiddleware,
    errorMiddleware,
    helmetMiddleware,
    sessionMiddleware,
    notFoundMiddleware,
    rateLimitMiddleware,
    appLocalStateMiddleware,
} from './middleware';
import ejs from 'ejs';
import cors from 'cors';
import express from 'express';
import { router } from './router';
import flash from 'connect-flash';
import { config } from './config';
import compression from 'compression';
import expressLayouts from 'express-ejs-layouts';
import { expressJSDocSwaggerHandler, swagger } from './util';
import { expressTemplatesReload as reload } from '@wajeht/express-templates-reload';

const app = express()
    .set('trust proxy', 1)
    .use(sessionMiddleware())
    .use(flash())
    .use(compression())
    .use(cors())
    .use(helmetMiddleware())
    .use(rateLimitMiddleware())
    .use(express.json({ limit: '10mb' }))
    .use(express.urlencoded({ extended: true, limit: '10mb' }))
    .use(express.static('./public', { maxAge: '30d', etag: true, lastModified: true }))
    .engine('html', ejs.renderFile)
    .set('view engine', 'html')
    .set('view cache', config.app.env === 'production')
    .set('views', './src/views/pages')
    .set('layout', '../layouts/public.html')
    .use(expressLayouts)
    .use(...csrfMiddleware)
    .use(appLocalStateMiddleware);

if (config.app.env === 'development') {
    reload({
        app,
        options: { quiet: false },
        watch: [
            { path: './public/style.css' },
            { path: './public/script.js' },
            { path: './src/views', extensions: ['.html'] },
        ],
    });
}

app.use(router);

expressJSDocSwaggerHandler(app, swagger);

app.use(notFoundMiddleware());
app.use(errorMiddleware());

export { app };
