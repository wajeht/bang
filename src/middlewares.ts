import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { appConfig, sessionConfig } from './configs';
import session from 'express-session';
import { logger } from './logger';
import { db, redis } from './db/db';
import connectRedisStore from 'connect-redis';
import { UnauthorizedError } from './errors';

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
		store: new connectRedisStore({
			client: redis,
			prefix: sessionConfig.store_prefix,
			disableTouch: true,
		}),
		proxy: appConfig.env === 'production',
		cookie: {
			path: '/',
			domain: `.${sessionConfig.domain}`,
			maxAge: 1000 * 60 * 60 * 24, // 24 hours
			httpOnly: appConfig.env === 'production',
			sameSite: 'lax',
			secure: appConfig.env === 'production',
		},
	});
}

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
