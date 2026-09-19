import { createRequest, createResponse } from 'node-mocks-http';
import type { RequestOptions } from 'node-mocks-http';
import type { Request, Response } from 'express';

export function createRequestFixture<T extends RequestOptions | Partial<Request>>(options: T) {
    const request: Request = createRequest();
    Object.assign(request, options);
    return request;
}

export function createResponseFixture<T extends Partial<Response>>(overrides: T) {
    return Object.assign(createResponse(), overrides);
}
