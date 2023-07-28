import { StatusCodes } from 'http-status-codes';
import { describe, expect, test } from 'vitest';

import {
	APICallsExceededError,
	NotFoundError,
	UnauthorizedError,
	ValidationError,
} from './api.errors';

describe('api.errors', () => {
	test('UnauthorizedError', () => {
		const error = new UnauthorizedError('unauthorized');
		expect(error.message).toBe('unauthorized');
		expect(error.statusCode).toBe(StatusCodes.UNAUTHORIZED);
	});

	test('NotFoundError', () => {
		const error = new NotFoundError('not found');
		expect(error.message).toBe('not found');
		expect(error.statusCode).toBe(StatusCodes.NOT_FOUND);
	});

	test('APICallsExceededError', () => {
		const error = new APICallsExceededError('too many requests');
		expect(error.message).toBe('too many requests');
		expect(error.statusCode).toBe(StatusCodes.TOO_MANY_REQUESTS);
	});

	test('ValidationError', () => {
		const error = new ValidationError('email already exist');
		expect(error.message).toBe('email already exist');
		expect(error.statusCode).toBe(StatusCodes.UNPROCESSABLE_ENTITY);
	});
});
