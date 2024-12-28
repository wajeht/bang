import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { appConfig, sessionConfig } from './configs';
import session from 'express-session';
import { logger } from './logger';
import { db } from './db/db';
import { ConnectSessionKnexStore } from 'connect-session-knex';
import { UnauthorizedError } from './errors';
import { validationResult } from 'express-validator';
import { api, expectJson, sendNotificationQueue } from './utils';
import { csrfSync } from 'csrf-sync';

export function notFoundMiddleware() {
	return (req: Request, res: Response, _next: NextFunction) => {
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
		logger.error(error);

		if (appConfig.env === 'production') {
			try {
				await sendNotificationQueue.push({ req, error });
			} catch (error) {
				logger.error(error);
			}
		}

		return res.status(500).render('error.html', {
			path: req.path,
			title: 'Error',
			statusCode: 500,
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
			await Promise.all(schemas.map((schema: any) => schema.run(req)));
			const result = validationResult(req) as any;

			// Always set input for POST, PATCH, PUT requests
			if (['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) {
				req.session.input = req.body;
			}

			if (result.isEmpty()) {
				// Clear errors if validation passes
				delete req.session.errors;
				return next();
			}

			const { errors } = result;
			const reshapedErrors = errors.reduce((acc: { [key: string]: string }, error: any) => {
				acc[error.path] = error.msg;
				return acc;
			}, {});

			// Note: is this a good idea? maybe we jus disable a toast since we already all errors state.input?
			// req.flash('error', Object.values(reshapedErrors));
			req.session.errors = reshapedErrors;

			return res.redirect(req.headers?.referer ?? 'back');
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

export async function authenticationMiddleware(req: Request, res: Response, next: NextFunction) {
	try {
		const apiKey = req.header('X-API-KEY');

		if (apiKey && expectJson(req)) {
			const apiKeyPayload = await api.verify(apiKey);

			if (!apiKeyPayload) {
				res.status(401).json({ message: 'invalid api key' });
				return;
			}

			req.apiKeyPayload = apiKeyPayload;

			return next();
		}

		if (!req.session?.user) {
			return res.redirect('/login');
		}

		const user = await db.select('*').from('users').where('id', req.session.user.id).first();

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
		next(error);
	}
}
