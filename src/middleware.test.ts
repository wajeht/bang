import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import { authenticationMiddleware } from './middleware';
import { db } from './db/db';
import { api, getApiKey, isApiRequest } from './util';
import { logger } from './logger';
import { UnauthorizedError } from './error';
import { Request, Response, NextFunction } from 'express';
import { User } from './type';
import { Session } from 'express-session';

vi.mock('./util', () => ({
    getApiKey: vi.fn(),
    isApiRequest: vi.fn(),
    api: {
        verify: vi.fn(),
    },
}));

vi.mock('./logger', () => ({
    logger: {
        error: vi.fn(),
    },
}));

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

        expect(res.redirect).toHaveBeenCalledWith('/login');

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

        expect(res.redirect).toHaveBeenCalledWith('/login');

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
        const mockDbSelect = vi.spyOn(db, 'select').mockImplementation(() => {
            throw new Error('Test database error');
        });

        const sessionUser = {
            id: testUser.id,
            username: testUser.username,
            email: testUser.email,
        } as unknown as User;

        req.session!.user = sessionUser;

        await authenticationMiddleware(req as Request, res as Response, next);

        expect(logger.error).toHaveBeenCalled();
        expect(next).toHaveBeenCalledWith(expect.any(Error));

        mockDbSelect.mockRestore();
    });
});
