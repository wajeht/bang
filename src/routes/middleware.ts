import type { Request, Response, NextFunction } from 'express';
import type { LayoutOptions, User, AppContext } from '../type';
import { ConnectSessionKnexStore } from 'connect-session-knex';

export function createRequestLoggerMiddleware(ctx: AppContext) {
    return (req: Request, res: Response, next: NextFunction) => {
        const requestId = ctx.libs.crypto.randomUUID().slice(0, 8);
        const start = Date.now();

        req.logger = ctx.logger.tag('requestId', requestId).tag('method', req.method);

        res.on('finish', () => {
            const duration = Date.now() - start;
            const hasQuery = req.query && Object.keys(req.query).length > 0;

            req.logger.info('request', {
                path: req.path,
                query: hasQuery ? JSON.stringify(req.query) : undefined,
                status: res.statusCode,
                duration: `${duration}ms`,
                userId: req.user?.id || 'anon',
                ip: req.ip || req.socket.remoteAddress,
                slow: duration >= ctx.config.app.slowRequestMs ? 'true' : undefined,
                ua: req.get('user-agent')?.slice(0, 50),
                ref: req.get('referer')?.slice(0, 100),
            });
        });

        next();
    };
}

export function createNotFoundMiddleware(ctx: AppContext) {
    return (req: Request, _res: Response, _next: NextFunction) => {
        throw new ctx.errors.NotFoundError(
            `Sorry, the ${ctx.utils.request.isApiRequest(req) ? 'resource' : 'page'} you are looking for could not be found.`,
        );
    };
}

export function createErrorMiddleware(ctx: AppContext) {
    return async (error: Error, req: Request, res: Response, _next: NextFunction) => {
        const logger = req.logger || ctx.logger;
        logger.error(`${req.method} ${req.path} - ${error.message}`, {
            error,
            url: req.url,
            userId: req.user?.id || req.session?.user?.id,
        });

        if ((error as { code?: string }).code === 'EBADCSRFTOKEN') {
            error = new ctx.errors.HttpError(403, error.message, req);
        } else if (!(error instanceof ctx.errors.HttpError)) {
            error = new ctx.errors.HttpError(500, error.message, req);
        } else if (error instanceof ctx.errors.HttpError && !(error as any).request) {
            (error as any).request = req;
        }

        const httpError = error as any;
        const statusCode = httpError.statusCode || 500;
        const message =
            httpError.message ||
            'The server encountered an internal error or misconfiguration and was unable to complete your request';

        if (ctx.utils.request.isApiRequest(req)) {
            const responsePayload: any = {
                message: statusCode === 422 ? 'Validation errors' : message,
            };

            if (statusCode === 422) {
                if (httpError instanceof ctx.errors.ValidationError) {
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
                if (httpError instanceof ctx.errors.ValidationError) {
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
            createSetupAppLocals(ctx)(req, res);
            // Load branding for error pages
            res.locals.state.branding = await ctx.models.settings.getBranding();
        }

        if (typeof res.locals.csrfToken === 'undefined') {
            res.locals.csrfToken = '';
        }

        ctx.utils.discord.sendErrorNotification(req, error, statusCode);

        return res.status(statusCode).render('general/error.html', {
            path: req.path,
            title: 'Error',
            statusCode,
            message: ctx.config.app.env !== 'production' ? error.stack : message,
        });
    };
}

export function createAdminOnlyMiddleware(ctx: AppContext) {
    return async (req: Request, _res: Response, next: NextFunction) => {
        try {
            if (!req.user || !req.user.is_admin) {
                throw new ctx.errors.UnauthorizedError('Unauthorized', req);
            }

            if (!req.session?.user || !req.session.user.is_admin) {
                throw new ctx.errors.UnauthorizedError('Unauthorized', req);
            }

            next();
        } catch (error) {
            next(error);
        }
    };
}

export function createHelmetMiddleware(ctx: AppContext) {
    return ctx.libs.helmet({
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                ...ctx.libs.helmet.contentSecurityPolicy.getDefaultDirectives(),
                'default-src': ["'self'", ctx.config.app.appUrl, '*.cloudflare.com'],
                'img-src': ["'self'", '*'],
                'script-src': [
                    "'self'",
                    "'unsafe-inline'",
                    "'unsafe-eval'",
                    'text/javascript',
                    'blob:',
                    ctx.config.app.appUrl,
                    '*.cloudflare.com',
                ],
                'script-src-elem': [
                    "'self'",
                    "'unsafe-inline'",
                    '*.cloudflare.com',
                    '*.cloudflareinsights.com',
                ],
                'frame-src': ["'self'", '*.cloudflare.com'],
                'style-src': ["'self'", "'unsafe-inline'", '*.cloudflare.com'],

                'connect-src': ["'self'", '*.cloudflare.com', '*.cloudflareinsights.com'],
                'script-src-attr': ["'self'", "'unsafe-inline'"],
                'form-action': ["'self'", '*'],
            },
        },
        referrerPolicy: {
            policy: 'strict-origin-when-cross-origin',
        },
    });
}

export function createSpeculationRulesMiddleware() {
    return (_req: Request, res: Response, next: NextFunction) => {
        res.setHeader('Supports-Loading-Mode', 'credentialed-prerender');
        next();
    };
}

export function createSessionMiddleware(ctx: AppContext) {
    return ctx.libs.session({
        secret: ctx.config.session.secret,
        resave: false,
        saveUninitialized: false,
        store: new ConnectSessionKnexStore({
            knex: ctx.db,
            tableName: 'sessions',
            createTable: true, // create sessions table if does not exist already
            cleanupInterval: 3600000, // 1 hour - less frequent to reduce lock contention
        }),
        proxy: ctx.config.app.env === 'production',
        cookie: {
            path: '/',
            domain:
                ctx.config.app.env === 'production' ? `.${ctx.config.session.domain}` : undefined,
            maxAge: 1000 * 60 * 60 * 24 * 7, // 7 days
            httpOnly: true,
            sameSite: 'lax',
            secure: ctx.config.app.env === 'production',
        },
    });
}

let cachedStaticLocals: {
    copyRightYear: number;
    version: { style: string | number; script: string | number };
    utils: Record<string, any>;
} | null = null;

export function createSetupAppLocals(ctx: AppContext) {
    if (!cachedStaticLocals) {
        const isProd = ctx.config.app.env === 'production';
        const assetVersions = isProd ? ctx.utils.assets.getAssetVersions() : null;
        cachedStaticLocals = {
            copyRightYear: ctx.libs.dayjs().year(),
            version: {
                style: assetVersions?.style ?? Math.random(),
                script: assetVersions?.script ?? Math.random(),
            },
            utils: {
                nl2br: ctx.utils.html.nl2br,
                truncateString: ctx.utils.util.truncateString,
                capitalize: ctx.utils.util.capitalize,
                getFaviconUrl: ctx.utils.util.getFaviconUrl,
                getScreenshotUrl: ctx.utils.util.getScreenshotUrl,
                isUrlLike: ctx.utils.validation.isUrlLike,
                stripHtmlTags: ctx.utils.html.stripHtmlTags,
                highlightSearchTerm: ctx.utils.html.highlightSearchTerm,
                formatDateInTimezone: ctx.utils.date.formatDateInTimezone,
            },
        };
    }

    return (req: Request, res: Response) => {
        // Ensure column_preferences is always parsed for session user
        const sessionUser = req.session?.user;
        const userWithParsedPrefs = sessionUser
            ? {
                  ...sessionUser,
                  column_preferences: ctx.utils.util.parseColumnPreferences(
                      sessionUser.column_preferences,
                  ),
              }
            : undefined;

        res.locals.state = {
            cloudflare_turnstile_site_key: ctx.config.cloudflare.turnstileSiteKey,
            env: ctx.config.app.env,
            user: req.user ?? userWithParsedPrefs,
            copyRightYear: cachedStaticLocals!.copyRightYear,
            input: (req.session?.input as Record<string, string>) || {},
            errors: (req.session?.errors as Record<string, string>) || {},
            flash: {
                success: req.flash ? req.flash('success') : [],
                error: req.flash ? req.flash('error') : [],
                info: req.flash ? req.flash('info') : [],
                warning: req.flash ? req.flash('warning') : [],
            },
            version: cachedStaticLocals!.version,
        };

        res.locals.utils = cachedStaticLocals!.utils;
    };
}

export function createCsrfMiddleware(ctx: AppContext) {
    const { csrfSynchronisedProtection, generateToken } = ctx.libs.csrfSync({
        getTokenFromRequest: (req: Request) => {
            if (req.body && req.body.csrfToken) {
                return req.body.csrfToken;
            }

            if (req.headers['x-csrf-token']) {
                return req.headers['x-csrf-token'] as string;
            }

            return undefined;
        },
        errorConfig: {
            statusCode: 403,
            message: 'Invalid or missing CSRF token. Please refresh the page and try again.',
            code: 'EBADCSRFTOKEN',
        },
    });

    return [
        (req: Request, res: Response, next: NextFunction) => {
            if (req.path.startsWith('/api/')) {
                return next();
            }

            if (ctx.utils.request.extractApiKey(req)) {
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
                // Ensure session is saved after CSRF token generation
                // This is needed because saveUninitialized: false means
                // the session won't auto-save for new visitors
                if (req.session) {
                    req.session.save((err) => {
                        if (err) {
                            ctx.logger
                                .tag('middleware', 'csrf')
                                .error('Failed to save session after CSRF token generation', {
                                    error: err,
                                });
                        }
                    });
                }
                next();
            } catch (error) {
                ctx.logger
                    .tag('middleware', 'csrf')
                    .error('CSRF token generation failed', { error });
                res.locals.csrfToken = '';
                next();
            }
        },
    ];
}

export function createAppLocalStateMiddleware(ctx: AppContext) {
    const FORM_DATA_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

    return async (req: Request, res: Response, next: NextFunction) => {
        try {
            // Skip for API routes - they don't need template locals
            if (req.path.startsWith('/api/')) {
                return next();
            }

            // Set session input for form data before setting up locals
            if (FORM_DATA_METHODS.has(req.method) && req.session) {
                req.session.input = req.body as Record<string, any>;
            }

            createSetupAppLocals(ctx)(req, res);

            // Load branding settings from database (cached in repository)
            res.locals.state.branding = await ctx.models.settings.getBranding();

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

const USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export function createAuthenticationMiddleware(ctx: AppContext) {
    return async function authenticationMiddleware(
        req: Request,
        res: Response,
        next: NextFunction,
    ) {
        try {
            const apiKey = ctx.utils.request.extractApiKey(req);

            let user: User | null = null;
            let needsRefresh = false;

            if (req.session?.user) {
                const cachedAt = req.session.userCachedAt || 0;
                const cacheExpired = Date.now() - cachedAt > USER_CACHE_TTL;

                if (!cacheExpired && req.session.user.id) {
                    // Use cached user data - already has parsed column_preferences
                    user = req.session.user;
                } else {
                    // Cache expired or missing timestamp, refresh from DB
                    needsRefresh = true;
                    user = await ctx.models.users.read(req.session.user.id);
                    // If user exists in session but not in DB, clear the session
                    if (!user) {
                        req.session.destroy((err) => {
                            if (err) {
                                ctx.logger
                                    .tag('middleware', 'auth')
                                    .error('Session destruction error', { error: err });
                            }
                        });
                    }
                }
            }

            if (apiKey) {
                const apiKeyPayload = await ctx.utils.auth.verifyApiKey(apiKey);

                if (!apiKeyPayload) {
                    throw new ctx.errors.UnauthorizedError('Invalid API key or Bearer token', req);
                }

                user = await ctx.models.users.read(apiKeyPayload.userId);
                needsRefresh = true;
            }

            if (!user) {
                if (ctx.utils.request.isApiRequest(req)) {
                    throw new ctx.errors.UnauthorizedError('Unauthorized - API key required', req);
                }

                if (req.session) {
                    req.session.redirectTo = req.originalUrl || req.url;
                    req.session.save();
                }

                res.redirect('/?modal=login');
                return;
            }

            // Always ensure column_preferences is properly parsed
            const parsedUser: User = {
                ...user,
                column_preferences: ctx.utils.util.parseColumnPreferences(user?.column_preferences),
            } as User;

            req.user = parsedUser;

            // Only update session if we refreshed from DB
            if (req.session && needsRefresh) {
                req.session.user = parsedUser;
                req.session.userCachedAt = Date.now();
                req.session.save();
            }

            next();
        } catch (error) {
            ctx.logger
                .tag('middleware', 'auth')
                .error(`Authentication error: ${(error as Error).message}`, {
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

export function createRateLimitMiddleware(ctx: AppContext) {
    return ctx.libs.rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        handler: async (req: Request, res: Response) => {
            if (ctx.utils.request.isApiRequest(req)) {
                return res.json({ message: 'Too many requests, please try again later.' });
            }
            return res.status(429).render('general/rate-limit.html');
        },
        skip: (_req: Request, _res: Response) => ctx.config.app.env !== 'production',
    });
}

export function createLayoutMiddleware(options: LayoutOptions = {}) {
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

export function createTurnstileMiddleware(ctx: AppContext) {
    return async function turnstileMiddleware(req: Request, _res: Response, next: NextFunction) {
        try {
            if (ctx.config.app.env !== 'production') {
                req.logger
                    .tag('middleware', 'turnstile')
                    .info('Skipping in non-production environment');
                return next();
            }

            if (req.method === 'GET' || ctx.utils.request.isApiRequest(req)) {
                return next();
            }

            const token = req.body['cf-turnstile-response'];
            if (!token) {
                throw new ctx.errors.ValidationError({
                    email: 'Turnstile verification failed: Missing token',
                });
            }

            const ip = (req.headers['cf-connecting-ip'] as string) || req.ip;
            await ctx.utils.util.verifyTurnstileToken(token, ip);

            next();
        } catch (error) {
            next(error);
        }
    };
}

export function createStaticAssetsMiddleware(ctx: AppContext) {
    return ctx.libs.express.static('./public', {
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
