import { Application } from 'express';
import type { AppContext } from '../type.js';

import { createAuthenticationMiddleware } from '../routes/middleware.js';
import { config } from '../config.js';

export async function expressJSDocSwaggerHandler(app: Application, context: AppContext) {
    if (context.config.app.env === 'testing') {
        return;
    }

    const { expressJSDocSwagger } = context.libs;

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
    };

    app.use('/api-docs', createAuthenticationMiddleware(context));
    expressJSDocSwagger(app)(swaggerConfig);
}
