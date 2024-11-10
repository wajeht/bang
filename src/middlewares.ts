import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { appConfig } from './configs';
import { logger } from './logger';

export function notFoundMiddleware() {
	return (req: Request, res: Response, next: NextFunction) => {
		return res.status(404).render('error.html', {
			statusCode: 404,
			message: 'not found',
		});
	};
}

export function errorMiddleware() {
	return async (
		error: Error & { statusCode?: number },
		req: Request,
		res: Response,
		next: NextFunction,
	) => {
		if (appConfig.env !== 'production') {
			logger.error(error);
		}

		return res.status(500).render('error.html', {
			statusCode: 500,
			message: appConfig.env !== 'production' ? error.stack : 'internal server error',
		});
	};
}

export function helmetMiddleware() {
	return helmet({
		contentSecurityPolicy: {
			useDefaults: true,
			directives: {
				...helmet.contentSecurityPolicy.getDefaultDirectives(),
				'default-src': ["'self'", 'plausible.jaw.dev', 'notify.jaw.dev', 'jaw.lol'],
				'script-src': [
					"'self'",
					"'unsafe-inline'",
					"'unsafe-eval'",
					'plausible.jaw.dev',
					'jaw.lol',
					'notify.jaw.dev',
				],
				'script-src-attr': ["'unsafe-inline'"],
			},
		},
		referrerPolicy: {
			policy: 'strict-origin-when-cross-origin',
		},
	});
}
