import { StatusCodes } from 'http-status-codes';

export class ForbiddenError extends Error {
	public statusCode: StatusCodes;
	constructor(message: string) {
		super();
		this.message = message;
		this.statusCode = StatusCodes.FORBIDDEN;
	}
}

export class UnauthorizedError extends Error {
	public statusCode: StatusCodes;
	constructor(message: string) {
		super();
		this.message = message;
		this.statusCode = StatusCodes.UNAUTHORIZED;
	}
}

export class NotFoundError extends Error {
	public statusCode: StatusCodes;
	constructor(message: string) {
		super();
		this.message = message;
		this.statusCode = StatusCodes.NOT_FOUND;
	}
}

export class APICallsExceededError extends Error {
	public statusCode: StatusCodes;
	constructor(message: string) {
		super();
		this.message = message;
		this.statusCode = StatusCodes.TOO_MANY_REQUESTS;
	}
}

export class ValidationError extends Error {
	public statusCode: StatusCodes;
	constructor(message: string) {
		super();
		this.message = message;
		this.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
	}
}
