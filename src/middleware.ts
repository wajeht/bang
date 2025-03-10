import helmet from 'helmet';
import { db } from './db/db';
import { logger } from './logger';
import session from 'express-session';
import { csrfSync } from 'csrf-sync';
import rateLimit from 'express-rate-limit';
import { CacheDuration, User } from './type';
import { validationResult } from 'express-validator';
import { NextFunction, Request, Response } from 'express';
import { ConnectSessionKnexStore } from 'connect-session-knex';
import { appConfig, CACHE_DURATION, sessionConfig } from './config';
import { HttpError, UnauthorizedError, ValidationError } from './error';
import { api, getApiKey, isApiRequest, sendNotificationQueue } from './util';

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

        if (appConfig.env === 'production') {
            try {
                void sendNotificationQueue.push({ req, error });
            } catch (queueError) {
                logger.error('Failed to push error to notification queue: %o', queueError);
            }
        }

        let statusCode = 500;
        let message =
            'The server encountered an internal error or misconfiguration and was unable to complete your request';

        if (error instanceof HttpError) {
            statusCode = error.statusCode;
            message = error.message;
        }

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
            throw new UnauthorizedError('Unauthorized');
        }

        if (!(req.user as User).is_admin) {
            throw new UnauthorizedError('User is not an admin');
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
                throw new ValidationError(
                    JSON.stringify({
                        fields: reshapedErrors,
                    }),
                );
            }

            return res.redirect(req.headers?.referer ?? '/');
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
                style: isProd ? '0.11' : randomNumber,
                script: isProd ? '0.9' : randomNumber,
            },
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
            user = await db.select('*').from('users').where({ id: req.session.user.id }).first();
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
                throw new UnauthorizedError('Invalid API key or Bearer token');
            }

            user = await db.select('*').from('users').where({ id: apiKeyPayload.userId }).first();
        }

        if (!user) {
            if (isApiRequest(req)) {
                throw new UnauthorizedError('Unauthorized');
            }

            return res.redirect('/login');
        }

        const parsedUser = {
            ...user,
            column_preferences: JSON.parse(user.column_preferences as unknown as string),
        };

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
            if (req.path.startsWith('/api')) {
                return res.status(429).json({
                    message: 'Too many requests from this IP, please try again later.',
                });
            }

            return res.status(429).send('Too many requests from this IP, please try again later.');
        },
        skip: (_req: any, _res: any) => appConfig.env !== 'production',
    });
}
