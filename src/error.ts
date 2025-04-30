import { Request } from 'express';
import { logger } from './logger';
import { appConfig } from './config';
import { sendNotificationQueue } from './util';

export class HttpError extends Error {
    statusCode: number;
    request?: Request;

    constructor(statusCode = 500, message = 'oh no, something went wrong!', request?: Request) {
        super(message);
        this.statusCode = statusCode;
        this.request = request;
        Object.setPrototypeOf(this, new.target.prototype);

        if (appConfig.env === 'production') {
            try {
                const req =
                    this.request ||
                    ({
                        method: null,
                        path: null,
                        url: null,
                        headers: {},
                        query: {},
                        body: {},
                    } as unknown as Request);

                void sendNotificationQueue.push({
                    req,
                    error: this,
                });

                logger.info(
                    `Pushed ${this.constructor.name} to notification queue: ${req.method} ${req.path} - ${this.message}`,
                );
            } catch (queueError) {
                logger.error('Failed to push error to notification queue: %o', queueError);
            }
        }
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
    constructor(message = 'validation error', request?: Request) {
        super(422, message, request);
    }
}

export class UnimplementedFunctionError extends HttpError {
    constructor(message = 'function not implemented', request?: Request) {
        super(501, message, request);
    }
}
