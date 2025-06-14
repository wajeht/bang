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
import { expressJSDocSwaggerHandler, swagger } from './swagger';
import { expressTemplatesReload as reload } from '@wajeht/express-templates-reload';

export function createApp(conf: typeof config) {
    const app = express()
        .set('trust proxy', 1)
        .use(sessionMiddleware())
        .use(flash())
        .use(compression())
        .use(cors())
        .use(helmetMiddleware())
        .use(rateLimitMiddleware())
        .use(express.json({ limit: '100kb' }))
        .use(express.urlencoded({ extended: true, limit: '100kb' }))
        .use(express.static('./public', { maxAge: '30d', etag: true, lastModified: true }))
        .engine('html', ejs.renderFile)
        .set('view engine', 'html')
        .set('view cache', conf.app.env === 'production' || conf.app.env === 'testing')
        .set('views', './src/views/pages')
        .set('layout', '../layouts/public.html')
        .use(expressLayouts)
        .use(...csrfMiddleware)
        .use(appLocalStateMiddleware);

    if (conf.app.env === 'development') {
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

    return app;
}
