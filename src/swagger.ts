import { app } from './app';
import { Application } from 'express';
import expressJSDocSwagger from 'express-jsdoc-swagger';
import { authenticationMiddleware, cacheMiddleware } from './middlewares';

export const swagger = {
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
};

export function expressJSDocSwaggerHandler(express: Application, swaggerConfig: typeof swagger) {
	express.use('/api-docs', authenticationMiddleware, cacheMiddleware(1, 'day'));
	expressJSDocSwagger(app)(swaggerConfig);
}
