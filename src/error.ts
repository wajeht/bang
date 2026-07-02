import type { AppRequest } from './type.js';

export class HttpError extends Error {
    statusCode: number;
    request?: AppRequest;

    constructor(statusCode = 500, message = 'oh no, something went wrong!', request?: AppRequest) {
        super(message);
        this.statusCode = statusCode;
        this.request = request;
        Object.setPrototypeOf(this, new.target.prototype);
    }
}

export class ForbiddenError extends HttpError {
    constructor(message = 'forbidden', request?: AppRequest) {
        super(403, message, request);
    }
}

export class UnauthorizedError extends HttpError {
    constructor(message = 'unauthorized', request?: AppRequest) {
        super(401, message, request);
    }
}

export class NotFoundError extends HttpError {
    constructor(message = 'not found', request?: AppRequest) {
        super(404, message, request);
    }
}

export class ValidationError extends HttpError {
    public errors: Record<string, string> = {};

    constructor(messageOrErrors: string | Record<string, string>, request?: AppRequest) {
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
    constructor(message = 'function not implemented', request?: AppRequest) {
        super(501, message, request);
    }
}
