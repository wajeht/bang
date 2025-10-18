import {
    HttpError,
    NotFoundError,
    ForbiddenError,
    ValidationError,
    UnauthorizedError,
    UnimplementedFunctionError,
} from './error';
import type { Request } from 'express';
import { describe, it, expect, beforeEach } from 'vitest';

describe('Error classes', () => {
    let mockRequest: Partial<Request>;

    beforeEach(() => {
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
    });

    describe('Error subclasses', () => {
        it('ForbiddenError should set correct status code', () => {
            const error = new ForbiddenError('No access', mockRequest as Request);
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe('No access');
            expect(error.request).toEqual(mockRequest);
        });

        it('UnauthorizedError should set correct status code', () => {
            const error = new UnauthorizedError('Login required', mockRequest as Request);
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe('Login required');
            expect(error.request).toEqual(mockRequest);
        });

        it('NotFoundError should set correct status code', () => {
            const error = new NotFoundError('Resource not found', mockRequest as Request);
            expect(error.statusCode).toBe(404);
            expect(error.message).toBe('Resource not found');
            expect(error.request).toEqual(mockRequest);
        });

        it('ValidationError should set correct status code and handle string messages', () => {
            const error = new ValidationError('Invalid input', mockRequest as Request);
            expect(error.statusCode).toBe(422);
            expect(error.message).toBe('Invalid input');
            expect(error.request).toEqual(mockRequest);
            expect(error.errors).toEqual({ general: 'Invalid input' });
        });

        it('ValidationError should handle error objects', () => {
            const errors = { email: 'Invalid email', password: 'Too short' };
            const error = new ValidationError(errors, mockRequest as Request);
            expect(error.statusCode).toBe(422);
            expect(error.errors).toEqual(errors);
        });

        it('UnimplementedFunctionError should set correct status code', () => {
            const error = new UnimplementedFunctionError(
                'Not implemented yet',
                mockRequest as Request,
            );
            expect(error.statusCode).toBe(501);
            expect(error.message).toBe('Not implemented yet');
            expect(error.request).toEqual(mockRequest);
        });
    });
});
