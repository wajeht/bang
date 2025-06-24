import helmet from 'helmet';
import { db } from './db/db';
import { logger } from './logger';
import { config } from './config';
import type { User } from './type';
import { users } from './repository';
import { csrfSync } from 'csrf-sync';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import { NextFunction, Request, Response } from 'express';
import { ConnectSessionKnexStore } from 'connect-session-knex';
import { api, nl2br, getApiKey, isApiRequest, highlightSearchTerm } from './util';
import { HttpError, NotFoundError, UnauthorizedError, ValidationError } from './error';

export const CACHE_DURATION = {
    second: 1,
    minute: 60,
    hour: 60 * 60,
    day: 24 * 60 * 60,
    week: 7 * 24 * 60 * 60,
    month: 30 * 24 * 60 * 60,
    year: 365 * 24 * 60 * 60,
} as const;

export function cacheMiddleware(value: number, unit: keyof typeof CACHE_DURATION = 'second') {
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
    return (req: Request, _res: Response, _next: NextFunction) => {
        throw new NotFoundError(
            `Sorry, the ${isApiRequest(req) ? 'resource' : 'page'} you are looking for could not be found.`,
        );
    };
}

export function errorMiddleware() {
    return async (error: Error, req: Request, res: Response, _next: NextFunction) => {
        logger.error(`${req.method} ${req.path} - ${error.message}`, { error });

        // Handle CSRF errors specifically - they have a code property
        if ((error as any).code === 'EBADCSRFTOKEN') {
            error = new HttpError(403, error.message, req);
        } else if (!(error instanceof HttpError)) {
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
                    logger.error(`Failed to parse error message as JSON: %o`, {
                        parseError: parseError as any,
                    });
                    responsePayload.details = message;
                }
            }

            res.status(statusCode).json(responsePayload);
            return;
        }

        // For form requests with validation errors, store errors and redirect back
        if (statusCode === 422) {
            if (req.session) {
                if (httpError instanceof ValidationError) {
                    // Use ValidationError's field mappings directly
                    req.session.errors = httpError.errors;
                } else {
                    // Other HTTP errors
                    req.session.errors = { general: message };
                }

                // Preserve form input for redisplay
                req.session.input = req.body as Record<string, any>;
            }
            const referer = req.headers?.referer || '/';
            return res.redirect(referer);
        }

        // Ensure locals are set up for error pages
        if (!res.locals.state) {
            setupAppLocals(req, res);
        }

        // Ensure csrfToken is available for error page rendering
        if (typeof res.locals.csrfToken === 'undefined') {
            res.locals.csrfToken = '';
        }

        return res.status(statusCode).render('error.html', {
            path: req.path,
            title: 'Error',
            statusCode,
            message: config.app.env !== 'production' ? error.stack : message,
        });
    };
}

export async function adminOnlyMiddleware(req: Request, _res: Response, next: NextFunction) {
    try {
        if (!req.user || (req.user as User).is_admin === false) {
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
        secret: config.session.secret,
        resave: false,
        saveUninitialized: false,
        store: new ConnectSessionKnexStore({
            knex: db,
            tableName: 'sessions',
            createTable: true, // create sessions table if does not exist already
            cleanupInterval: 60000, // 1 minute - clear expired sessions
        }),
        proxy: config.app.env === 'production',
        cookie: {
            path: '/',
            // Don't set domain for localhost/127.0.0.1 to avoid cookie issues in tests
            domain:
                config.session.domain === 'production' ? `.${config.session.domain}` : undefined,
            maxAge: 1000 * 60 * 60 * 24 * 30, // 30 days
            httpOnly: config.session.domain === 'production',
            sameSite: 'lax',
            secure: config.session.domain === 'production',
        },
    });
}

export function setupAppLocals(req: Request, res: Response) {
    const isProd = config.app.env === 'production';
    const randomNumber = Math.random();

    res.locals.state = {
        env: config.app.env,
        user: req.user ?? req.session?.user,
        copyRightYear: new Date().getFullYear(),
        input: (req.session?.input as Record<string, any>) || {},
        errors: (req.session?.errors as Record<string, any>) || {},
        flash: {
            success: req.flash ? req.flash('success') : [],
            error: req.flash ? req.flash('error') : [],
            info: req.flash ? req.flash('info') : [],
            warning: req.flash ? req.flash('warning') : [],
        },
        version: {
            style: isProd ? '0.18' : randomNumber,
            script: isProd ? '0.16' : randomNumber,
        },
    };

    res.locals.utils = {
        highlightSearchTerm,
        nl2br,
    };
}

export const csrfMiddleware = (() => {
    const { csrfSynchronisedProtection, generateToken } = csrfSync({
        getTokenFromRequest: (req: Request) => {
            // For form submissions, check body first
            if (req.body && req.body.csrfToken) {
                return req.body.csrfToken;
            }
            // For AJAX requests, check headers
            if (req.headers['x-csrf-token']) {
                return req.headers['x-csrf-token'] as string;
            }
            // Fallback to query parameter
            return req.query.csrfToken as string;
        },
        errorConfig: {
            statusCode: 403,
            message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
            code: 'EBADCSRFTOKEN',
        },
    });

    return [
        (req: Request, res: Response, next: NextFunction) => {
            // Skip CSRF protection for API requests (they use API keys)
            if (isApiRequest(req)) {
                return next();
            }

            // Skip CSRF protection for safe HTTP methods that don't modify data
            if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
                return next();
            }

            csrfSynchronisedProtection(req, res, next);
        },
        (req: Request, res: Response, next: NextFunction) => {
            try {
                res.locals.csrfToken = generateToken(req);
                next();
            } catch (error) {
                logger.error('CSRF token generation failed', { error });
                res.locals.csrfToken = '';
                next();
            }
        },
    ];
})();

export async function appLocalStateMiddleware(req: Request, res: Response, next: NextFunction) {
    try {
        // Set session input for form data before setting up locals
        if (/^(POST|PATCH|PUT|DELETE)$/.test(req.method) && req.session) {
            req.session.input = req.body as Record<string, any>;
        }

        setupAppLocals(req, res);

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
                        logger.error(`Session destruction error: %o`, { err });
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
                throw new UnauthorizedError('Unauthorized - API key required', req);
            }

            if (req.session) {
                req.session.redirectTo = req.originalUrl || req.url;
                req.session.save();
            }

            res.redirect('/?login=true');
            return;
        }

        const parsedUser = {
            ...user,
            column_preferences: user?.column_preferences
                ? JSON.parse(user.column_preferences as unknown as string)
                : {},
        } as User;

        req.user = parsedUser;

        if (req.session) {
            req.session.user = parsedUser;
            req.session.save();
        }

        next();
    } catch (error) {
        logger.error(`Authentication error: %o`, { error: error as any });
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
        skip: (_req: Request, _res: Response) => config.app.env !== 'production',
    });
}
