import {
    HttpError,
    NotFoundError,
    ForbiddenError,
    ValidationError,
    UnauthorizedError,
    UnimplementedFunctionError,
} from './error';
import { config } from './config';
import type { Request } from 'express';
import { logger } from './utils/logger';
import { sendNotification } from './utils/util';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./utils/util', () => ({
    sendNotification: vi.fn(),
}));

vi.mock('./config', () => ({
    config: {
        app: {
            env: 'production',
            adminEmail: 'test-admin@example.com',
        },
        email: {
            host: 'testing',
            port: 1234,
            secure: false,
            user: 'testing',
            password: 'testing',
        },
    },
}));

vi.mock('./utils/logger', () => ({
    logger: {
        error: vi.fn(),
        info: vi.fn(),
    },
}));

describe('Error classes', () => {
    let mockRequest: Partial<Request>;

    beforeEach(() => {
        vi.resetAllMocks();
        mockRequest = {
            method: 'GET',
            url: '/test',
            headers: {},
            query: {},
            body: {},
        };
    });

    describe('HttpError base class', () => {
        it('should create a generic HttpError with default values', () => {
            const error = new HttpError();
            expect(error.statusCode).toBe(500);
            expect(error.message).toBe('oh no, something went wrong!');
            expect(error.request).toBeUndefined();
        });

        it('should create an HttpError with custom values', () => {
            const error = new HttpError(400, 'Bad request');
            expect(error.statusCode).toBe(400);
            expect(error.message).toBe('Bad request');
        });

        it('should store the request object when provided', () => {
            const error = new HttpError(500, 'Server error', mockRequest as Request);
            expect(error.request).toEqual(mockRequest);
        });

        it('should send a notification when in production and request is provided', async () => {
            const error = new HttpError(500, 'Test error', mockRequest as Request);

            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(sendNotification).toHaveBeenCalledWith({
                req: mockRequest,
                error,
            });
            expect(logger.info).toHaveBeenCalled();
        });

        it('should not send a notification when not in production', () => {
            const originalEnv = config.app.env;
            Object.defineProperty(config.app, 'env', { value: 'development' });

            new HttpError(500, 'Test error', mockRequest as Request);
            expect(sendNotification).not.toHaveBeenCalled();

            Object.defineProperty(config.app, 'env', { value: originalEnv });
        });

        it('should not send a notification when in development mode', () => {
            const originalEnv = config.app.env;
            Object.defineProperty(config.app, 'env', { value: 'development' });

            new HttpError(500, 'Test error without request');
            expect(sendNotification).not.toHaveBeenCalled();

            Object.defineProperty(config.app, 'env', { value: originalEnv });
        });

        it('should now send a notification even when request is not provided in production', async () => {
            new HttpError(500, 'Test error without request');

            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(sendNotification).toHaveBeenCalledWith({
                req: expect.objectContaining({
                    method: null,
                    path: null,
                    url: null,
                    headers: {},
                    query: {},
                    body: {},
                }),
                error: expect.any(HttpError),
            });
        });
    });

    describe('Error subclasses', () => {
        it('ForbiddenError should send notification and set correct status code', async () => {
            const error = new ForbiddenError('No access', mockRequest as Request);
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe('No access');
            expect(error.request).toEqual(mockRequest);

            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(sendNotification).toHaveBeenCalledWith({
                req: mockRequest,
                error,
            });
        });

        it('UnauthorizedError should send notification and set correct status code', async () => {
            const error = new UnauthorizedError('Login required', mockRequest as Request);
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe('Login required');
            expect(error.request).toEqual(mockRequest);

            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(sendNotification).toHaveBeenCalledWith({
                req: mockRequest,
                error,
            });
        });

        it('NotFoundError should send notification and set correct status code', async () => {
            const error = new NotFoundError('Resource not found', mockRequest as Request);
            expect(error.statusCode).toBe(404);
            expect(error.message).toBe('Resource not found');
            expect(error.request).toEqual(mockRequest);

            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(sendNotification).toHaveBeenCalledWith({
                req: mockRequest,
                error,
            });
        });

        it('ValidationError should send notification and set correct status code', async () => {
            const error = new ValidationError('Invalid input', mockRequest as Request);
            expect(error.statusCode).toBe(422);
            expect(error.message).toBe('Invalid input');
            expect(error.request).toEqual(mockRequest);

            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(sendNotification).toHaveBeenCalledWith({
                req: mockRequest,
                error,
            });
        });

        it('UnimplementedFunctionError should send notification and set correct status code', async () => {
            const error = new UnimplementedFunctionError(
                'Not implemented yet',
                mockRequest as Request,
            );
            expect(error.statusCode).toBe(501);
            expect(error.message).toBe('Not implemented yet');
            expect(error.request).toEqual(mockRequest);

            await new Promise((resolve) => setTimeout(resolve, 0));

            expect(sendNotification).toHaveBeenCalledWith({
                req: mockRequest,
                error,
            });
        });
    });
});
