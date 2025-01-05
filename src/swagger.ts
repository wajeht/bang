import { app } from './app';
import path from 'node:path';
import expressJSDocSwagger from 'express-jsdoc-swagger';
import { authenticationMiddleware } from './middlewares';
import { Application } from 'express';

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
	baseDir: path.resolve(path.join(process.cwd(), 'src')),
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
	servers: [
		{
			url: 'http://localhost',
			description: 'The local server',
		},
		{
			url: 'https://bang.jaw.dev',
			description: 'The production server',
		},
	],
};

export function expressJSDocSwaggerHandler(express: Application, swaggerConfig: typeof swagger) {
	express.use('/api-docs', authenticationMiddleware);
	expressJSDocSwagger(app)(swaggerConfig);
}