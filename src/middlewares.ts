import { db } from './db/db';
import helmet from 'helmet';
import { logger } from './logger';
import session from 'express-session';
import { csrfSync } from 'csrf-sync';
import { appConfig, sessionConfig } from './configs';
import { validationResult } from 'express-validator';
import { NextFunction, Request, Response } from 'express';
import { UnauthorizedError, ValidationError } from './errors';
import { ConnectSessionKnexStore } from 'connect-session-knex';
import { api, getApiKey, isApiRequest, sendNotificationQueue } from './utils';

export function notFoundMiddleware() {
	return (req: Request, res: Response, _next: NextFunction) => {
		if (isApiRequest(req)) {
			res.status(404).json({
				title: 'Not Found',
				statusCode: 404,
				message: 'not found',
			});
			return;
		}

		return res.status(404).render('error.html', {
			path: req.path,
			title: 'Not Found',
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
		_next: NextFunction,
	) => {
		logger.error('%o', error);

		if (appConfig.env === 'production') {
			try {
				await sendNotificationQueue.push({ req, error });
			} catch (error) {
				logger.error(error);
			}
		}

		const statusCode = error.statusCode || 500;

		if (isApiRequest(req)) {
			res.status(statusCode).json({
				message: statusCode === 422 ? 'Validation errors' : error.message,
				...(statusCode === 422 && { details: JSON.parse(error.message) }),
			});
			return;
		}

		return res.status(statusCode).render('error.html', {
			path: req.path,
			title: 'Error',
			statusCode,
			message: appConfig.env !== 'production' ? error.stack : 'An error occurred',
		});
	};
}

export async function adminOnlyMiddleware(req: Request, res: Response, next: NextFunction) {
	try {
		if (!req.user) {
			throw UnauthorizedError('Unauthorized');
		}

		if (!req.user.is_admin) {
			throw UnauthorizedError('User is not an admin');
		}

		next();
	} catch (error) {
		next(error);
	}
}

export function helmetMiddleware() {
	return helmet({
		contentSecurityPolicy: {
			useDefaults: true,
			directives: {
				...helmet.contentSecurityPolicy.getDefaultDirectives(),
				'default-src': ["'self'", 'plausible.jaw.dev', 'bang.jaw.dev', 'jaw.lol'],
				'script-src': [
					"'self'",
					"'unsafe-inline'",
					"'unsafe-eval'",
					'plausible.jaw.dev',
					'jaw.lol',
					'bang.jaw.dev',
				],
				'script-src-attr': ["'unsafe-inline'"],
				'form-action': ["'self'", '*'],
			},
		},
		referrerPolicy: {
			policy: 'strict-origin-when-cross-origin',
		},
	});
}

export function sessionMiddleware() {
	return session({
		secret: sessionConfig.secret,
		resave: false,
		saveUninitialized: false,
		store: new ConnectSessionKnexStore({
			knex: db,
			tableName: 'sessions',
			createTable: false,
		}),
		proxy: appConfig.env === 'production',
		cookie: {
			path: '/',
			domain: `.${sessionConfig.domain}`,
			maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
			httpOnly: appConfig.env === 'production',
			sameSite: 'lax',
			secure: appConfig.env === 'production',
		},
	});
}

export const validateRequestMiddleware = (schemas: any) => {
	return async (req: Request, res: Response, next: NextFunction) => {
		try {
			for (const schema of schemas) {
				await schema.run(req);
			}

			const result = validationResult(req) as any;

			// Always set input for POST, PATCH, PUT requests
			if (/^(POST|PATCH|PUT|DELETE)$/.test(req.method)) {
				req.session.input = req.body;
			}

			if (result.isEmpty()) {
				// Clear errors if validation passes
				delete req.session.errors;
				return next();
			}

			const { errors } = result;
			const reshapedErrors: { [key: string]: string } = {};
			for (const error of errors) {
				reshapedErrors[error.path] = error.msg;
			}

			req.session.errors = reshapedErrors;

			if (isApiRequest(req)) {
				throw ValidationError(
					JSON.stringify({
						fields: reshapedErrors,
					}),
				);
			}

			return res.redirect(
				req.headers?.referer && new URL(req.headers?.referer).pathname === req.path
					? req.headers?.referer
					: '/',
			);
		} catch (error) {
			next(error);
		}
	};
};

export const csrfMiddleware = (() => {
	const { csrfSynchronisedProtection } = csrfSync({
		getTokenFromRequest: (req: Request) => req.body.csrfToken || req.query.csrfToken,
	});

	return [
		csrfSynchronisedProtection,
		(req: Request, res: Response, next: NextFunction) => {
			// @ts-expect-error - trust be bro
			res.locals.csrfToken = req.csrfToken();
			next();
		},
	];
})();

export async function appLocalStateMiddleware(req: Request, res: Response, next: NextFunction) {
	try {
		res.locals.state = {
			user: req.user ?? req.session.user,
			copyRightYear: new Date().getFullYear(),
			input: req.session?.input || {},
			errors: req.session?.errors || {},
			flash: {
				success: req.flash('success'),
				error: req.flash('error'),
				info: req.flash('info'),
				warning: req.flash('warning'),
			},
		};

		// Clear session input and errors after setting locals
		// This ensures they're available for the current request only
		delete req.session.input;
		delete req.session.errors;

		next();
	} catch (error) {
		next(error);
	}
}

export async function authenticationMiddleware(req: Request, res: Response, next: NextFunction) {
	try {
		const apiKey = getApiKey(req);

		let user;

		if (apiKey) {
			const apiKeyPayload = await api.verify(apiKey);

			if (!apiKeyPayload) {
				throw UnauthorizedError('Invalid API key or Bearer token');
			}

			user = await db.select('*').from('users').where({ id: apiKeyPayload.userId }).first();
		} else if (req.session?.user) {
			user = await db.select('*').from('users').where({ id: req.session.user.id }).first();
		}

		if (!user) {
			if (isApiRequest(req)) {
				throw UnauthorizedError('Unauthorized');
			}

			return res.redirect('/login');
		}

		req.user = user;
		req.session.user = user;
		req.session.save();

		next();
	} catch (error) {
		logger.error('Authentication error: %o', error);
		next(error);
	}
}
