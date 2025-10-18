import type { Request } from 'express';

export class HttpError extends Error {
    statusCode: number;
    request?: Request;

    constructor(statusCode = 500, message = 'oh no, something went wrong!', request?: Request) {
        super(message);
        this.statusCode = statusCode;
        this.request = request;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class ForbiddenError extends HttpError {
    constructor(message = 'forbidden', request?: Request) {
        super(403, message, request);
    }
}

export class UnauthorizedError extends HttpError {
    constructor(message = 'unauthorized', request?: Request) {
        super(401, message, request);
    }
}

export class NotFoundError extends HttpError {
    constructor(message = 'not found', request?: Request) {
        super(404, message, request);
    }
}

export class ValidationError extends HttpError {
    public errors: Record<string, string> = {};

    constructor(messageOrErrors: string | Record<string, string>, request?: Request) {
        let message = 'validation error';

        if (typeof messageOrErrors === 'string') {
            message = messageOrErrors;
            super(422, message, request);
            this.errors = { general: message };
        } else if (typeof messageOrErrors === 'object') {
            super(422, message, request);
            this.errors = messageOrErrors;
        } else {
            super(422, message, request);
            this.errors = { general: message };
        }
    }
}

export class UnimplementedFunctionError extends HttpError {
    constructor(message = 'function not implemented', request?: Request) {
        super(501, message, request);
    }
}
