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
			return res.status(404).json({
				title: 'Not Found',
				statusCode: 404,
				message: 'not found',
			});
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
			if (statusCode === 422) {
				return res.status(422).json({
					message: 'validation errors',
					...JSON.parse(error.message),
				});
			}

			if (statusCode === 404) {
				return res.status(404).json({ message: 'not found' });
			}

			return res.status(statusCode).json({
				message: appConfig.env !== 'production' ? error.message : 'An error occurred',
				statusCode,
				...(appConfig.env !== 'production' && { stack: error.stack }),
			});
		}

		return res.status(statusCode).render('error.html', {
			path: req.path,
			title: 'Error',
			statusCode,
			message: appConfig.env !== 'production' ? error.stack : 'internal server error',
		});
	};
}

export async function adminOnlyMiddleware(req: Request, res: Response, next: NextFunction) {
	try {
		if (!req.session?.user) {
			return res.redirect('/login');
		}

		if (!req.session.user.is_admin) {
			throw UnauthorizedError();
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
			user: req.session?.user
				? await db.select('*').from('users').where('id', req.session.user.id).first()
				: null,
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

export async function apiKeyOnlyAuthenticationMiddleware(
	req: Request,
	res: Response,
	next: NextFunction,
) {
	try {
		const apiKey = getApiKey(req);

		if (!apiKey) {
			res.status(401).json({ message: 'API key or Bearer token is missing' });
			return;
		}

		const apiKeyPayload = await api.verify(apiKey);

		if (!apiKeyPayload) {
			res.status(401).json({ message: 'Invalid API key or Bearer token' });
			return;
		}

		req.apiKeyPayload = apiKeyPayload;

		next();
	} catch (error) {
		logger.error('Failed to authenticate API key or Bearer token', error);
		res.status(500).json({ message: 'Internal server error' });
		return;
	}
}

export async function authenticationMiddleware(req: Request, res: Response, next: NextFunction) {
	try {
		if (!req.session?.user) {
			return res.redirect('/login');
		}

		const user = await db.select('*').from('users').where({ id: req.session.user.id }).first();

		if (!user) {
			req.session.destroy((err) => {
				if (err) {
					logger.error('Error destroying session:', err);
				}
				return res.redirect('/login');
			});

			return;
		}

		req.session.user = user;
		req.session.save();

		next();
	} catch (error) {
		logger.error('Authentication error: %o', error);
		next(error);
	}
}
