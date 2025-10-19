import type { AppContext } from '../type';
import swaggerJsdoc from 'swagger-jsdoc';
import swaggerUi from 'swagger-ui-express';
import { Application, Request, Response } from 'express';
import { AuthenticationMiddleware } from '../routes/middleware';

const swaggerDefinition = {
    openapi: '3.0.0',
    info: {
        title: 'Bang',
        version: '0.0.1',
        description: 'your personal command center for blazingly fast web navigation',
        termsOfService: '/terms-of-service',
        contact: {
            name: 'Support',
            url: 'https://github.com/wajeht/bang/issues',
        },
        license: {
            name: 'MIT',
            url: 'https://github.com/wajeht/bang/blob/main/LICENSE',
        },
    },
    servers: [
        {
            url: 'http://localhost',
            description: 'Development server',
        },
    ],
    components: {
        securitySchemes: {
            BearerAuth: {
                type: 'http',
                scheme: 'bearer',
                bearerFormat: 'JWT',
            },
        },
    },
    security: [
        {
            BearerAuth: [],
        },
    ],
};

const options = {
    definition: swaggerDefinition,
    apis: ['./src/routes/**/*.ts', './src/routes/**/*.js'],
};

const swaggerSpec = swaggerJsdoc(options);

export function expressJSDocSwaggerHandler(app: Application, context: AppContext) {
    app.get('/api-docs/swagger.json', (_req: Request, res: Response) => {
        res.setHeader('Content-Type', 'application/json');
        res.send(swaggerSpec);
    });

    app.use(
        '/api-docs',
        AuthenticationMiddleware(context),
        swaggerUi.serve,
        swaggerUi.setup(swaggerSpec, {
            customSiteTitle:
                'Bang - your personal command center for blazingly fast web navigation',
            customfavIcon: '/favicon.ico',
            swaggerOptions: {
                url: '/api-docs/swagger.json',
            },
        }),
    );
}
