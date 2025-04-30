import helmet from 'helmet';
import { db } from './db/db';
import { logger } from './logger';
import { users } from './repository';
import { csrfSync } from 'csrf-sync';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import { CACHE_DURATION } from './constant';
import { CacheDuration, User } from './type';
import { appConfig, sessionConfig } from './config';
import { validationResult } from 'express-validator';
import { NextFunction, Request, Response } from 'express';
import { ConnectSessionKnexStore } from 'connect-session-knex';
import { HttpError, UnauthorizedError, ValidationError } from './error';
import { api, nl2br, getApiKey, isApiRequest, highlightSearchTerm } from './util';

export function cacheMiddleware(value: number, unit: CacheDuration = 'second') {
    const seconds = value * CACHE_DURATION[unit];

    return (req: Request, res: Response, next: NextFunction) => {
        if (req.method !== 'GET') {
            return next();
        }

        if (isApiRequest(req)) {
            res.set({
                'Cache-Control': `private, max-age=${seconds}, must-revalidate`,
                Vary: 'Authorization, Accept-Encoding',
                'Surrogate-Control': `max-age=${seconds}`,
                'stale-while-revalidate': '30',
                'stale-if-error': '86400',
            });
        } else {
            res.set('Cache-Control', `public, max-age=${seconds}`);
        }

        next();
    };
}

export function notFoundMiddleware() {
    return (req: Request, res: Response, _next: NextFunction) => {
        if (isApiRequest(req)) {
            res.status(404).json({
                title: 'Not Found',
                statusCode: 404,
                message: 'Sorry, the resource you are looking for could not be found.',
            });
            return;
        }

        return res.status(404).render('error.html', {
            path: req.path,
            title: 'Not Found',
            statusCode: 404,
            message: 'Sorry, the page you are looking for could not be found.',
        });
    };
}

export function errorMiddleware() {
    return async (error: Error, req: Request, res: Response, _next: NextFunction) => {
        logger.error(`${req.method} ${req.path} - ${error.message}`, error);

        if (!(error instanceof HttpError)) {
            error = new HttpError(500, error.message, req);
        } else if (error instanceof HttpError && !error.request) {
            error.request = req;
        }

        const httpError = error as HttpError;
        const statusCode = httpError.statusCode || 500;
        const message =
            httpError.message ||
            'The server encountered an internal error or misconfiguration and was unable to complete your request';

        if (isApiRequest(req)) {
            const responsePayload: any = {
                message: statusCode === 422 ? 'Validation errors' : message,
            };

            if (statusCode === 422) {
                try {
                    responsePayload.details = JSON.parse(message);
                } catch (parseError) {
                    logger.error('Failed to parse error message as JSON: %o', parseError);
                    responsePayload.details = message;
                }
            }

            res.status(statusCode).json(responsePayload);
            return;
        }

        return res.status(statusCode).render('error.html', {
            path: req.path,
            title: 'Error',
            statusCode,
            message: appConfig.env !== 'production' ? error.stack : message,
        });
    };
}

export async function adminOnlyMiddleware(req: Request, _res: Response, next: NextFunction) {
    try {
        if (!req.user) {
            throw new UnauthorizedError('Unauthorized', req);
        }

        if (!(req.user as User).is_admin) {
            throw new UnauthorizedError('Unauthorized', req);
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
                'default-src': ["'self'", 'plausible.jaw.dev', 'bang.jaw.dev'],
                'script-src': [
                    "'self'",
                    "'unsafe-inline'",
                    "'unsafe-eval'",
                    'plausible.jaw.dev',
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
            createTable: true, // create sessions table if does not exist already
            cleanupInterval: 60000, // 1 minute - clear expired sessions
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

export function validateRequestMiddleware(schemas: any) {
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
                throw new ValidationError(
                    JSON.stringify({
                        fields: reshapedErrors,
                    }),
                    req,
                );
            }

            return res.redirect(req.headers?.referer ?? '/');
        } catch (error) {
            next(error);
        }
    };
}

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
        const isProd = appConfig.env === 'production';
        const randomNumber = Math.random();

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
            version: {
                style: isProd ? '0.14' : randomNumber,
                script: isProd ? '0.10' : randomNumber,
            },
        };

        // utility functions for frontend
        res.locals.utils = {
            highlightSearchTerm,
            nl2br,
        };

        // Clear session input and errors after setting locals
        // This ensures they're available for the current request only
        if (req.session) {
            delete req.session.input;
            delete req.session.errors;
        }

        next();
    } catch (error) {
        next(error);
    }
}

export async function authenticationMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
        const apiKey = getApiKey(req);

        let user: User | null = null;

        if (req.session?.user) {
            user = await users.read(req.session.user.id);
            // If user exists in session but not in DB, clear the session
            if (!user) {
                req.session.destroy((err) => {
                    if (err) {
                        logger.error('Session destruction error: %o', err);
                    }
                });
            }
        }

        if (apiKey) {
            const apiKeyPayload = await api.verify(apiKey);

            if (!apiKeyPayload) {
                throw new UnauthorizedError('Invalid API key or Bearer token', req);
            }

            user = await users.read(apiKeyPayload.userId);
        }

        if (!user) {
            if (isApiRequest(req)) {
                throw new UnauthorizedError('Unauthorized', req);
            }

            req.session.redirectTo = req.originalUrl || req.url;
            req.session.save();
            res.redirect('/login');
            return;
        }

        const parsedUser = {
            ...user,
            column_preferences: user?.column_preferences
                ? JSON.parse(user.column_preferences as unknown as string)
                : {},
        } as User;

        req.user = parsedUser;
        req.session.user = parsedUser;
        req.session.save();

        next();
    } catch (error) {
        logger.error('Authentication error: %o', error);
        next(error);
    }
}

export function rateLimitMiddleware() {
    return rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        handler: (req, res) => {
            if (req.path.startsWith('/api/')) {
                return res.status(429).json({
                    message: 'Too many requests from this IP, please try again later.',
                });
            }

            return res.status(429).send('Too many requests from this IP, please try again later.');
        },
        skip: (_req: Request, _res: Response) => appConfig.env !== 'production',
    });
}
