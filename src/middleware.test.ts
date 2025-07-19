import { db } from './db/db';
import { users } from './db/db';
import type { User } from './type';
import { logger } from './utils/logger';
import { Session } from 'express-session';
import { api, getApiKey, isApiRequest } from './utils/util';
import type { Request, Response, NextFunction } from 'express';
import { authenticationMiddleware, errorMiddleware } from './middleware';
import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { NotFoundError, ValidationError, ForbiddenError, UnauthorizedError } from './error';

vi.mock('./utils/util', () => ({
    getApiKey: vi.fn(),
    isApiRequest: vi.fn(),
    api: {
        verify: vi.fn(),
    },
    getFaviconUrl: vi.fn((url) => url),
    sendNotificationQueue: {
        push: vi.fn(),
    },
    highlightSearchTerm: vi.fn((text, _term) => text),
    nl2br: vi.fn((text) => text),
}));

vi.mock('./utils/logger', () => ({
    logger: {
        error: vi.fn(),
        info: vi.fn(),
    },
}));

vi.mock('./config', () => ({
    config: {
        app: {
            env: 'testing',
        },
        session: {
            domain: 'testing',
        },
        email: {
            host: 'testing',
            port: 1234,
            secure: false,
            user: 'testing',
            password: 'testing',
        },
        notify: {
            url: 'https://testing',
            apiKey: 'testing',
        },
        cloudflare: {
            turnstileSiteKey: 'deeznutz',
            turnstileSecretKey: 'joemama',
        },
    },
}));

vi.mock('./db/db', async () => {
    const actual = await vi.importActual('./db/db');
    return {
        ...(actual as any),
        users: {
            ...(actual as any).users,
            read: vi.fn(),
            readByEmail: vi.fn(),
        },
    };
});

describe('authenticationMiddleware', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let next: NextFunction;
    let testUser: any;

    beforeAll(async () => {
        await db('users').where('email', 'like', '%test%').delete();

        [testUser] = await db('users')
            .insert({
                username: 'testuser',
                email: 'test@example.com',
                is_admin: false,
                default_search_provider: 'duckduckgo',
                column_preferences: JSON.stringify({
                    bookmarks: {
                        title: true,
                    },
                }),
            })
            .returning('*');
    });

    afterAll(async () => {
        await db('users').where('email', 'like', '%test%').delete();
    });

    beforeEach(() => {
        vi.resetAllMocks();

        vi.mocked(users.read).mockImplementation(async (id) => {
            if (id === testUser.id) {
                return {
                    id: testUser.id,
                    username: testUser.username,
                    email: testUser.email,
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                    column_preferences: JSON.stringify({
                        bookmarks: {
                            title: true,
                        },
                    }),
                };
            }
            if (id === 11) {
                // Null prefs user (added dynamically in the related test)
                return {
                    id: 11,
                    username: 'nullprefs',
                    email: 'null@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                    column_preferences: null,
                };
            }
            return null;
        });

        req = {
            session: {
                destroy: vi.fn((callback) => callback(null)),
                save: vi.fn(),
                regenerate: vi.fn(),
                reload: vi.fn(),
                touch: vi.fn(),
                id: 'test-session-id',
                cookie: { maxAge: 30000 },
                user: undefined,
                redirectTo: undefined,
            } as unknown as Session & { user?: any; redirectTo?: string },
            originalUrl: '/dashboard',
            url: '/dashboard',
            user: undefined,
        };

        res = {
            redirect: vi.fn(),
        };

        next = vi.fn();
    });

    it('should authenticate user from session', async () => {
        const sessionUser = {
            id: testUser.id,
            username: testUser.username,
            email: testUser.email,
        } as unknown as User;

        req.session!.user = sessionUser;

        await authenticationMiddleware(req as Request, res as Response, next);

        expect(req.user).toEqual(
            expect.objectContaining({
                id: testUser.id,
                username: testUser.username,
                email: testUser.email,
                column_preferences: { bookmarks: { title: true } },
            }),
        );

        expect(req.session!.save).toHaveBeenCalled();

        expect(next).toHaveBeenCalledWith();
    });

    it('should destroy session if user in session not found in db', async () => {
        const sessionUser = {
            id: 999999, // Non-existent ID
            username: 'nonexistent',
            email: 'nonexistent@example.com',
        } as unknown as User;

        req.session!.user = sessionUser;

        vi.mocked(getApiKey).mockReturnValue(undefined);

        vi.mocked(isApiRequest).mockReturnValue(false);

        await authenticationMiddleware(req as Request, res as Response, next);

        expect(req.session!.destroy).toHaveBeenCalled();

        expect(res.redirect).toHaveBeenCalledWith('/?modal=login');

        expect(next).not.toHaveBeenCalled();
    });

    it('should authenticate user with API key', async () => {
        const apiKey = 'test-api-key';
        vi.mocked(getApiKey).mockReturnValue(apiKey);

        const apiKeyPayload = { userId: testUser.id, apiKeyVersion: 1 };
        vi.mocked(api.verify).mockResolvedValue(apiKeyPayload);

        await authenticationMiddleware(req as Request, res as Response, next);

        expect(getApiKey).toHaveBeenCalledWith(req);
        expect(api.verify).toHaveBeenCalledWith(apiKey);

        expect(req.user).toEqual(
            expect.objectContaining({
                id: testUser.id,
                username: testUser.username,
                email: testUser.email,
                column_preferences: { bookmarks: { title: true } },
            }),
        );

        expect(req.session!.user).toBeDefined();
        expect(req.session!.save).toHaveBeenCalled();

        expect(next).toHaveBeenCalledWith();
    });

    it('should throw UnauthorizedError if API key is invalid', async () => {
        const apiKey = 'invalid-api-key';
        vi.mocked(getApiKey).mockReturnValue(apiKey);

        vi.mocked(api.verify).mockResolvedValue(null);

        await authenticationMiddleware(req as Request, res as Response, next);

        expect(getApiKey).toHaveBeenCalledWith(req);
        expect(api.verify).toHaveBeenCalledWith(apiKey);

        expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
        expect(logger.error).toHaveBeenCalled();
    });

    it('should redirect to login if no user found and not API request', async () => {
        req.session!.user = undefined;

        vi.mocked(getApiKey).mockReturnValue(undefined);

        vi.mocked(isApiRequest).mockReturnValue(false);

        await authenticationMiddleware(req as Request, res as Response, next);

        expect(res.redirect).toHaveBeenCalledWith('/?modal=login');

        expect(req.session!.redirectTo).toBe('/dashboard');
        expect(req.session!.save).toHaveBeenCalled();

        expect(next).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedError if no user found and is API request', async () => {
        req.session!.user = undefined;

        vi.mocked(getApiKey).mockReturnValue(undefined);

        vi.mocked(isApiRequest).mockReturnValue(true);

        await authenticationMiddleware(req as Request, res as Response, next);

        expect(next).toHaveBeenCalledWith(expect.any(UnauthorizedError));
        expect(logger.error).toHaveBeenCalled();
    });

    it('should handle null column_preferences correctly', async () => {
        const nullPrefUser = await db('users')
            .insert({
                username: 'nullprefs',
                email: 'null@example.com',
                is_admin: false,
                default_search_provider: 'duckduckgo',
                column_preferences: null,
            })
            .returning('*')
            .then((users) => users[0]);

        vi.mocked(users.read).mockImplementation(async (id) => {
            if (id === nullPrefUser.id) {
                return {
                    id: nullPrefUser.id,
                    username: nullPrefUser.username,
                    email: nullPrefUser.email,
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                    column_preferences: null,
                };
            }
            return null;
        });

        const sessionUser = {
            id: nullPrefUser.id,
            username: nullPrefUser.username,
            email: nullPrefUser.email,
        } as unknown as User;

        req.session!.user = sessionUser;

        await authenticationMiddleware(req as Request, res as Response, next);

        expect(req.user).toEqual(
            expect.objectContaining({
                id: nullPrefUser.id,
                username: nullPrefUser.username,
                email: nullPrefUser.email,
                column_preferences: {},
            }),
        );

        expect(next).toHaveBeenCalledWith();

        await db('users').where({ id: nullPrefUser.id }).delete();
    });

    it('should handle general error during authentication', async () => {
        vi.clearAllMocks();

        const testError = new Error('Test database error');
        vi.mocked(users.read).mockRejectedValue(testError);

        const sessionUser = {
            id: testUser.id,
            username: testUser.username,
            email: testUser.email,
        } as unknown as User;

        req.session!.user = sessionUser;

        await authenticationMiddleware(req as Request, res as Response, next);

        expect(logger.error).toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
});

describe('errorMiddleware', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let next: NextFunction;

    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(isApiRequest).mockReturnValue(false);

        req = {
            method: 'GET',
            path: '/test',
            url: '/test',
            headers: {},
            body: {},
            query: {},
            session: {
                destroy: vi.fn((callback) => callback(null)),
                save: vi.fn(),
                regenerate: vi.fn(),
                reload: vi.fn(),
                touch: vi.fn(),
                id: 'test-session-id',
                cookie: { maxAge: 30000 },
            } as unknown as Session,
            flash: vi.fn().mockReturnValue([]),
        };
        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            render: vi.fn().mockReturnThis(),
            redirect: vi.fn().mockReturnThis(),
            locals: {},
        };
        next = vi.fn();
    });

    it('should preserve the correct status code for different error types', async () => {
        const errorMiddlewareInstance = errorMiddleware();

        const notFoundError = new NotFoundError('Resource not found');
        await errorMiddlewareInstance(
            notFoundError,
            req as unknown as Request,
            res as unknown as Response,
            next,
        );
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.render).toHaveBeenCalledWith(
            'error.html',
            expect.objectContaining({
                statusCode: 404,
                message: expect.stringContaining('Resource not found'),
            }),
        );

        vi.resetAllMocks();
        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            render: vi.fn().mockReturnThis(),
            redirect: vi.fn().mockReturnThis(),
            locals: {},
        };

        const validationError = new ValidationError('Invalid input');
        await errorMiddlewareInstance(
            validationError,
            req as unknown as Request,
            res as unknown as Response,
            next,
        );
        expect(res.redirect).toHaveBeenCalledWith('/');

        vi.resetAllMocks();
        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            render: vi.fn().mockReturnThis(),
            redirect: vi.fn().mockReturnThis(),
            locals: {},
        };

        const unauthorizedError = new UnauthorizedError('Unauthorized access');
        await errorMiddlewareInstance(
            unauthorizedError,
            req as unknown as Request,
            res as unknown as Response,
            next,
        );
        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.render).toHaveBeenCalledWith(
            'error.html',
            expect.objectContaining({
                statusCode: 401,
                message: expect.stringContaining('Unauthorized access'),
            }),
        );

        vi.resetAllMocks();
        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            render: vi.fn().mockReturnThis(),
            redirect: vi.fn().mockReturnThis(),
            locals: {},
        };

        const forbiddenError = new ForbiddenError('Forbidden access');
        await errorMiddlewareInstance(
            forbiddenError,
            req as unknown as Request,
            res as unknown as Response,
            next,
        );
        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.render).toHaveBeenCalledWith(
            'error.html',
            expect.objectContaining({
                statusCode: 403,
                message: expect.stringContaining('Forbidden access'),
            }),
        );

        vi.resetAllMocks();
        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            render: vi.fn().mockReturnThis(),
            redirect: vi.fn().mockReturnThis(),
            locals: {},
        };

        const regularError = new Error('Something went wrong');
        await errorMiddlewareInstance(
            regularError,
            req as unknown as Request,
            res as unknown as Response,
            next,
        );
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.render).toHaveBeenCalledWith(
            'error.html',
            expect.objectContaining({
                statusCode: 500,
                message: expect.stringContaining('Something went wrong'),
            }),
        );
    });

    it('should handle API requests with different error types', async () => {
        vi.mocked(isApiRequest).mockReturnValue(true);
        const errorMiddlewareInstance = errorMiddleware();

        const notFoundError = new NotFoundError('API resource not found');
        await errorMiddlewareInstance(
            notFoundError,
            req as unknown as Request,
            res as unknown as Response,
            next,
        );
        expect(res.status).toHaveBeenCalledWith(404);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'API resource not found',
            }),
        );

        vi.resetAllMocks();
        vi.mocked(isApiRequest).mockReturnValue(true);
        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            render: vi.fn().mockReturnThis(),
            redirect: vi.fn().mockReturnThis(),
            locals: {},
        };

        const validationError = new ValidationError('{"fields":{"name":"Required"}}');
        await errorMiddlewareInstance(
            validationError,
            req as unknown as Request,
            res as unknown as Response,
            next,
        );
        expect(res.status).toHaveBeenCalledWith(422);
        expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
                message: 'Validation errors',
                details: expect.anything(),
            }),
        );
    });

    it('should call req.flash with error messages when session has errors for 422 status', async () => {
        vi.mocked(isApiRequest).mockReturnValue(false);
        const errorMiddlewareInstance = errorMiddleware();

        req.headers = { referer: '/test-page' };

        const validationError = new ValidationError('Validation failed');
        validationError.errors = {
            name: 'Name is required',
            email: 'Email is invalid',
        };

        await errorMiddlewareInstance(
            validationError,
            req as unknown as Request,
            res as unknown as Response,
            next,
        );

        expect(req.flash).toHaveBeenCalledWith('error', 'Name is required, Email is invalid');
        expect(res.redirect).toHaveBeenCalledWith('/test-page');
    });
});
