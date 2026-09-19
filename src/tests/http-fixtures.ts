import { createRequest, createResponse } from 'node-mocks-http';
import type { Session } from 'express-session';
import type { Request, Response } from 'express';

// Session spies may return void, but their arguments and stored data keep the app's types.
type SessionFixture = {
    [Key in keyof Request['session']]?: Key extends 'cookie'
        ? Partial<Request['session'][Key]>
        : Request['session'][Key] extends (...args: infer Args) => Session
          ? (...args: Args) => void
          : Request['session'][Key];
};

interface RequestFixtureOptions extends Partial<Omit<Request, 'session' | 'socket'>> {
    session?: SessionFixture;
    socket?: Partial<Request['socket']>;
}

export function createRequestFixture(options: RequestFixtureOptions) {
    const request: Request = createRequest();
    Object.assign(request, options);
    return request;
}

export function createResponseFixture<T extends Partial<Response>>(overrides: T) {
    return Object.assign(createResponse(), overrides);
}
