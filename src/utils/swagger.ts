import { Application } from 'express';
import type { AppContext } from '../type';
import type { Options } from 'express-jsdoc-swagger';
import expressJSDocSwagger from 'express-jsdoc-swagger';
import { AuthenticationMiddleware } from '../routes/middleware';

const swaggerConfig = {
    info: {
        title: 'Bang',
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
    filesPattern: ['**/routes/**/*.ts', '**/routes/**/*.js'],
    swaggerUIPath: '/api-docs',
    exposeSwaggerUI: true,
    notRequiredAsNullable: false,
    swaggerUiOptions: {
        customSiteTitle: `Bang - your personal command center for blazingly fast web navigation`,
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

export function expressJSDocSwaggerHandler(app: Application, context: AppContext) {
    app.use('/api-docs', AuthenticationMiddleware(context));
    expressJSDocSwagger(app)(swaggerConfig);
}
