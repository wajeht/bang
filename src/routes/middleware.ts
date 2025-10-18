import type { Request, Response, NextFunction } from 'express';
import type { LayoutOptions, User, AppContext } from '../type';
import { ConnectSessionKnexStore } from 'connect-session-knex';

export function NotFoundMiddleware(context: AppContext) {
    return (req: Request, _res: Response, _next: NextFunction) => {
        throw new context.errors.NotFoundError(
            `Sorry, the ${context.utils.auth.isApiRequest(req) ? 'resource' : 'page'} you are looking for could not be found.`,
        );
    };
}

export function ErrorMiddleware(context: AppContext) {
    return async (error: Error, req: Request, res: Response, _next: NextFunction) => {
        context.logger.error(`${req.method} ${req.path} - ${error.message}`, {
            error: {
                stack: error.stack,
                name: error.name,
                cause: error.cause,
            },
            request: {
                url: req.url,
                method: req.method,
                userId: req.user?.id || req.session?.user?.id,
            },
        });

        if ((error as { code?: string }).code === 'EBADCSRFTOKEN') {
            error = new context.errors.HttpError(403, error.message, req);
        } else if (!(error instanceof context.errors.HttpError)) {
            error = new context.errors.HttpError(500, error.message, req);
        } else if (error instanceof context.errors.HttpError && !(error as any).request) {
            (error as any).request = req;
        }

        const httpError = error as any;
        const statusCode = httpError.statusCode || 500;
        const message = httpError.message || 'The server encountered an internal error or misconfiguration and was unable to complete your request'; // prettier-ignore

        if (context.utils.auth.isApiRequest(req)) {
            const responsePayload: any = {
                message: statusCode === 422 ? 'Validation errors' : message,
            };

            if (statusCode === 422) {
                if (httpError instanceof context.errors.ValidationError) {
                    responsePayload.details = httpError.errors;
                } else {
                    responsePayload.details = message;
                }
            }

            res.status(statusCode).json(responsePayload);
            return;
        }

        if (statusCode === 422) {
            if (req.session) {
                if (httpError instanceof context.errors.ValidationError) {
                    req.session.errors = httpError.errors;
                } else {
                    req.session.errors = { general: message };
                }

                req.session.input = req.body as Record<string, any>;
            }
            const referer = req.headers?.referer || '/';

            if (req.session && req.session.errors) {
                req.flash(
                    'error',
                    Object.values(req.session.errors as Record<string, string>).join(', '),
                );
            }

            if (req.path === '/login') {
                return res.redirect('/?modal=login');
            }

            return res.redirect(referer);
        }

        if (!res.locals.state) {
            SetupAppLocals(context)(req, res);
        }

        if (typeof res.locals.csrfToken === 'undefined') {
            res.locals.csrfToken = '';
        }

        return res.status(statusCode).render('general/error.html', {
            path: req.path,
            title: 'Error',
            statusCode,
            message: context.config.app.env !== 'production' ? error.stack : message,
        });
    };
}

export function AdminOnlyMiddleware(context: AppContext) {
    return async (req: Request, _res: Response, next: NextFunction) => {
        try {
            if (!req.user || !req.user.is_admin) {
                throw new context.errors.UnauthorizedError('Unauthorized', req);
            }

            if (!req.session?.user || !req.session.user.is_admin) {
                throw new context.errors.UnauthorizedError('Unauthorized', req);
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

export function HelmetMiddleware(context: AppContext) {
    return context.libs.helmet({
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                ...context.libs.helmet.contentSecurityPolicy.getDefaultDirectives(),
                'default-src': ["'self'", 'plausible.jaw.dev', 'bang.jaw.dev', '*.cloudflare.com'],
                'img-src': ["'self'", '*'],
                'script-src': [
                    "'self'",
                    "'unsafe-inline'",
                    "'unsafe-eval'",
                    'text/javascript',
                    'blob:',
                    'plausible.jaw.dev',
                    'bang.jaw.dev',
                    '*.cloudflare.com',
                ],
                'script-src-elem': [
                    "'self'",
                    "'unsafe-inline'",
                    'https://plausible.jaw.dev',
                    '*.cloudflare.com',
                ],
                'frame-src': ["'self'", '*.cloudflare.com'],
                'style-src': ["'self'", "'unsafe-inline'", '*.cloudflare.com'],

                'connect-src': ["'self'", 'plausible.jaw.dev', '*.cloudflare.com'],
                'script-src-attr': ["'self'", "'unsafe-inline'"],
                'form-action': ["'self'", '*'],
            },
        },
        referrerPolicy: {
            policy: 'strict-origin-when-cross-origin',
        },
    });
}

export function SessionMiddleware(context: AppContext) {
    return context.libs.session({
        secret: context.config.session.secret,
        resave: false,
        saveUninitialized: false,
        store: new ConnectSessionKnexStore({
            knex: context.db,
            tableName: 'sessions',
            createTable: true, // create sessions table if does not exist already
            cleanupInterval: 60000, // 1 minute - clear expired sessions
        }),
        proxy: context.config.app.env === 'production',
        cookie: {
            path: '/',
            // Don't set domain for localhost/127.0.0.1 to avoid cookie issues in tests
            domain: context.config.session.domain === 'production' ? `.${context.config.session.domain}` : undefined, // prettier-ignore
            maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
            httpOnly: context.config.session.domain === 'production',
            sameSite: 'lax',
            secure: context.config.session.domain === 'production',
        },
    });
}

export function SetupAppLocals(context: AppContext) {
    return (req: Request, res: Response) => {
        const isProd = context.config.app.env === 'production';
        const randomNumber = Math.random();

        res.locals.state = {
            cloudflare_turnstile_site_key: context.config.cloudflare.turnstileSiteKey,
            env: context.config.app.env,
            user: req.user ?? req.session?.user,
            copyRightYear: context.libs.dayjs().year(),
            input: (req.session?.input as Record<string, string>) || {},
            errors: (req.session?.errors as Record<string, string>) || {},
            flash: {
                success: req.flash ? req.flash('success') : [],
                error: req.flash ? req.flash('error') : [],
                info: req.flash ? req.flash('info') : [],
                warning: req.flash ? req.flash('warning') : [],
            },
            version: {
                style: isProd ? '0.37' : randomNumber,
                script: isProd ? '0.19' : randomNumber,
            },
        };

        res.locals.utils = {
            nl2br: context.utils.html.nl2br,
            getFaviconUrl: context.utils.util.getFaviconUrl,
            isUrlLike: context.utils.validation.isUrlLike,
            stripHtmlTags: context.utils.html.stripHtmlTags,
            highlightSearchTerm: context.utils.html.highlightSearchTerm,
            formatDateInTimezone: context.utils.date.formatDateInTimezone,
        };
    };
}

export function CsrfMiddleware(context: AppContext) {
    const { csrfSynchronisedProtection, generateToken } = context.libs.csrfSync({
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
            // Skip CSRF protection for API routes
            if (req.path.startsWith('/api/')) {
                return next();
            }

            // Skip CSRF protection if API key is provided
            if (context.utils.auth.extractApiKey(req)) {
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
                context.logger.error('CSRF token generation failed', { error });
                res.locals.csrfToken = '';
                next();
            }
        },
    ];
}

export function AppLocalStateMiddleware(context: AppContext) {
    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Set session input for form data before setting up locals
            if (/^(POST|PATCH|PUT|DELETE)$/.test(req.method) && req.session) {
                req.session.input = req.body as Record<string, any>;
            }

            SetupAppLocals(context)(req, res);

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
    };
}

export function AuthenticationMiddleware(context: AppContext) {
    return async function authenticationMiddleware(
        req: Request,
        res: Response,
        next: NextFunction,
    ) {
        try {
            const apiKey = context.utils.auth.extractApiKey(req);

            let user: User | null = null;

            if (req.session?.user) {
                user = await context.models.users.read(req.session.user.id);
                // If user exists in session but not in DB, clear the session
                if (!user) {
                    req.session.destroy((err) => {
                        if (err) {
                            context.logger.error(`Session destruction error: %o`, { err });
                        }
                    });
                }
            }

            if (apiKey) {
                const apiKeyPayload = await context.utils.auth.verifyApiKey(apiKey);

                if (!apiKeyPayload) {
                    throw new context.errors.UnauthorizedError(
                        'Invalid API key or Bearer token',
                        req,
                    );
                }

                user = await context.models.users.read(apiKeyPayload.userId);
            }

            if (!user) {
                if (context.utils.auth.isApiRequest(req)) {
                    throw new context.errors.UnauthorizedError(
                        'Unauthorized - API key required',
                        req,
                    );
                }

                if (req.session) {
                    req.session.redirectTo = req.originalUrl || req.url;
                    req.session.save();
                }

                res.redirect('/?modal=login');
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
            context.logger.error(`Authentication error: ${(error as Error).message}`, {
                error: {
                    name: (error as Error).name,
                    message: (error as Error).message,
                    stack: (error as Error).stack,
                },
            });
            next(error);
        }
    };
}

export function RateLimitMiddleware(context: AppContext) {
    return context.libs.rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        handler: async (req: Request, res: Response) => {
            if (context.utils.auth.isApiRequest(req)) {
                return res.json({ message: 'Too many requests, please try again later.' });
            }
            return res.status(429).render('general/rate-limit.html');
        },
        skip: (_req: Request, _res: Response) => context.config.app.env !== 'production',
    });
}

export function LayoutMiddleware(options: LayoutOptions = {}) {
    const defaultOptions: LayoutOptions = {
        defaultLayout: '_layouts/public.html',
        layoutsDir: '_layouts',
        ...options,
    };

    return (_req: any, res: any, next: any) => {
        const originalRender = res.render;

        res.render = function (
            view: string,
            viewOptions: any = {},
            callback?: (err: Error | null, html?: string) => void,
        ) {
            const layout =
                viewOptions.layout === false
                    ? false
                    : viewOptions.layout || defaultOptions.defaultLayout;
            const options = { ...viewOptions };

            if (!layout) {
                return originalRender.call(this, view, options, callback);
            }

            originalRender.call(this, view, options, (err: Error | null, html: string) => {
                if (err) return callback ? callback(err) : next(err);

                const layoutOptions = {
                    ...options,
                    body: html,
                };

                delete layoutOptions.layout;

                originalRender.call(this, layout, layoutOptions, callback);
            });
        };

        next();
    };
}

export function TurnstileMiddleware(context: AppContext) {
    return async function turnstileMiddleware(req: Request, _res: Response, next: NextFunction) {
        try {
            if (context.config.app.env !== 'production') {
                context.logger.info('Skipping turnstile middleware in non-production environment');
                return next();
            }

            if (req.method === 'GET' || context.utils.auth.isApiRequest(req)) {
                return next();
            }

            const token = req.body['cf-turnstile-response'];
            if (!token) {
                throw new context.errors.ValidationError({
                    email: 'Turnstile verification failed: Missing token',
                });
            }

            const ip = (req.headers['cf-connecting-ip'] as string) || req.ip;
            await context.utils.util.verifyTurnstileToken(token, ip);

            next();
        } catch (error) {
            next(error);
        }
    };
}

export function staticAssetsMiddleware(context: AppContext) {
    return context.libs.express.static('./public', {
        maxAge: '365d', // 1 year
        etag: true,
        lastModified: true,
        immutable: true,
        setHeaders: (res, path, _stat) => {
            if (path.match(/\.(css|js|png|jpg|jpeg|gif|webp|svg|ico|woff|woff2|ttf|eot|txt)$/)) {
                res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
                res.setHeader('Vary', 'Accept-Encoding');
            }
        },
    });
}
