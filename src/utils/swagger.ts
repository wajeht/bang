import { Application } from 'express';
import { authenticationMiddleware } from '../middleware';
import { cacheMiddleware } from './cache';
import expressJSDocSwagger from 'express-jsdoc-swagger';
import type { Options } from 'express-jsdoc-swagger';

const swaggerConfig = {
    info: {
        title: 'bang',
        description: `DuckDuckGo's !Bangs, but on steroids`,
        termsOfService: `/terms-of-service`,
        contact: {
            name: 'Support',
            url: `https://github.com/wajeht/bang/issues`,
        },
        license: {
            name: 'MIT',
            url: 'https://github.com/wajeht/bang/blob/main/LICENSE',
        },
        version: '0.0.1',
    },
    baseDir: './src',
    filesPattern: ['./**/router.ts'],
    swaggerUIPath: '/api-docs',
    exposeSwaggerUI: true,
    notRequiredAsNullable: false,
    swaggerUiOptions: {
        customSiteTitle: `DuckDuckGo's !Bangs, but on steroids`,
        customfavIcon: '/favicon.ico',
    },
    security: {
        BearerAuth: {
            type: 'http',
            scheme: 'bearer',
        },
    },
    multiple: {},
} as unknown as Options;

export function expressJSDocSwaggerHandler(app: Application) {
    app.use('/api-docs', authenticationMiddleware, cacheMiddleware(30, 'day'));
    expressJSDocSwagger(app)(swaggerConfig);
}
