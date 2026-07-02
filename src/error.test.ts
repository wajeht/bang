import {
    HttpError,
    NotFoundError,
    ForbiddenError,
    ValidationError,
    UnauthorizedError,
    UnimplementedFunctionError,
} from './error.js';
import { describe, it, expect } from 'vite-plus/test';

describe('Error classes', () => {
    describe('HttpError base class', () => {
        it('should create a generic HttpError with default values', () => {
            const error = new HttpError();
            expect(error.statusCode).toBe(500);
            expect(error.message).toBe('oh no, something went wrong!');
        });

        it('should create an HttpError with custom values', () => {
            const error = new HttpError(400, 'Bad request');
            expect(error.statusCode).toBe(400);
            expect(error.message).toBe('Bad request');
        });
    });

    describe('Error subclasses', () => {
        it('ForbiddenError should set correct status code', () => {
            const error = new ForbiddenError('No access');
            expect(error.statusCode).toBe(403);
            expect(error.message).toBe('No access');
        });

        it('UnauthorizedError should set correct status code', () => {
            const error = new UnauthorizedError('Login required');
            expect(error.statusCode).toBe(401);
            expect(error.message).toBe('Login required');
        });

        it('NotFoundError should set correct status code', () => {
            const error = new NotFoundError('Resource not found');
            expect(error.statusCode).toBe(404);
            expect(error.message).toBe('Resource not found');
        });

        it('ValidationError should set correct status code and handle string messages', () => {
            const error = new ValidationError('Invalid input');
            expect(error.statusCode).toBe(422);
            expect(error.message).toBe('Invalid input');
            expect(error.errors).toEqual({ general: 'Invalid input' });
        });

        it('ValidationError should handle error objects', () => {
            const errors = { email: 'Invalid email', password: 'Too short' };
            const error = new ValidationError(errors);
            expect(error.statusCode).toBe(422);
            expect(error.errors).toEqual(errors);
        });

        it('UnimplementedFunctionError should set correct status code', () => {
            const error = new UnimplementedFunctionError('Not implemented yet');
            expect(error.statusCode).toBe(501);
            expect(error.message).toBe('Not implemented yet');
        });
    });
});
