import { Application } from 'express';
import type { AppContext } from '../type';
import type { Options } from 'express-jsdoc-swagger';
import { AuthenticationMiddleware } from '../routes/middleware';
import { config } from '../config';

export async function expressJSDocSwaggerHandler(app: Application, context: AppContext) {
    // Skip swagger in testing - it's a heavy library not needed for tests
    if (context.config.app.env === 'testing') {
        return;
    }

    // Dynamic import to avoid loading swagger-ui in tests
    const { default: expressJSDocSwagger } = await import('express-jsdoc-swagger');

    const branding = await context.models.settings.getBranding();

    const swaggerConfig = {
        info: {
            title: branding.appName,
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
        baseDir: config.app.env === 'production' ? './dist/src' : './src',
        filesPattern:
            config.app.env === 'production' ? ['**/routes/**/*.js'] : ['**/routes/**/*.ts'],
        swaggerUIPath: '/api-docs',
        exposeSwaggerUI: true,
        notRequiredAsNullable: false,
        swaggerUiOptions: {
            customSiteTitle: `${branding.appName} - your personal command center for blazingly fast web navigation`,
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

    app.use('/api-docs', AuthenticationMiddleware(context));
    expressJSDocSwagger(app)(swaggerConfig);
}
