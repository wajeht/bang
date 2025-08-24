import { Application } from 'express';
import type { Options } from 'express-jsdoc-swagger';
import expressJSDocSwagger from 'express-jsdoc-swagger';
import { authenticationMiddleware } from '../routes/middleware';

const swaggerConfig = {
    info: {
        title: 'bang',
        description: `your personal command center for blazingly fast web navigation`,
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
    filesPattern: [
        '**/routes/**/*.ts',
        '**/routes/**/*.ts'
    ],
    swaggerUIPath: '/api-docs',
    exposeSwaggerUI: true,
    notRequiredAsNullable: false,
    swaggerUiOptions: {
        customSiteTitle: `your personal command center for blazingly fast web navigation`,
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
    app.use('/api-docs', authenticationMiddleware);
    expressJSDocSwagger(app)(swaggerConfig);
}
