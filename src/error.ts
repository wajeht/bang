export class HttpError extends Error {
	statusCode: number;

	constructor(statusCode = 500, message = 'oh no, something went wrong!') {
		super(message);
		this.statusCode = statusCode;
		Object.setPrototypeOf(this, new.target.prototype);
	}
}

export class ForbiddenError extends HttpError {
	constructor(message = 'forbidden') {
		super(403, message);
	}
}

export class UnauthorizedError extends HttpError {
	constructor(message = 'unauthorized') {
		super(401, message);
	}
}

export class NotFoundError extends HttpError {
	constructor(message = 'not found') {
		super(404, message);
	}
}

export class ValidationError extends HttpError {
	constructor(message = 'validation error') {
		super(422, message);
	}
}

export class UnimplementedFunctionError extends HttpError {
	constructor(message = 'function not implemented') {
		super(501, message);
	}
}
