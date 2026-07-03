import { expect } from 'vite-plus/test';

interface HonoTestApp {
    request(input: string | Request, requestInit?: RequestInit): Response | Promise<Response>;
}

type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
type Expectation =
    | { type: 'status'; value: number }
    | { type: 'header'; name: string; value: string | RegExp };

export interface HonoTestResponse {
    body: any;
    headers: Record<string, string>;
    raw: Response;
    status: number;
    text: string;
}

class CookieJar {
    private readonly cookies = new Map<string, string>();

    getHeader() {
        return [...this.cookies.entries()].map(([key, value]) => `${key}=${value}`).join('; ');
    }

    store(response: Response) {
        const setCookie = response.headers.get('set-cookie');
        if (!setCookie) return;

        for (const cookie of splitSetCookie(setCookie)) {
            const [pair] = cookie.split(';');
            if (!pair) continue;

            const separatorIndex = pair.indexOf('=');
            if (separatorIndex === -1) continue;

            const name = pair.slice(0, separatorIndex).trim();
            const value = pair.slice(separatorIndex + 1).trim();
            if (name) {
                this.cookies.set(name, value);
            }
        }
    }
}

class HonoTestRequest implements PromiseLike<HonoTestResponse> {
    private readonly headers = new Headers();
    private readonly expectations: Expectation[] = [];
    private bodyData: unknown;
    private bodyType: 'json' | 'form' | 'text' | null = null;
    private queryParams: Record<string, unknown> | null = null;

    constructor(
        private readonly app: HonoTestApp,
        private readonly method: HttpMethod,
        private readonly path: string,
        private readonly cookieJar?: CookieJar,
    ) {}

    set(name: string | Record<string, string>, value?: string) {
        if (typeof name === 'string') {
            if (value != null) {
                this.headers.set(name, value);
            }
            return this;
        }

        for (const [key, headerValue] of Object.entries(name)) {
            this.headers.set(key, headerValue);
        }
        return this;
    }

    type(value: string) {
        if (value === 'form') {
            this.bodyType = 'form';
            this.headers.set('Content-Type', 'application/x-www-form-urlencoded');
            return this;
        }

        this.headers.set('Content-Type', value);
        return this;
    }

    query(params: Record<string, unknown>) {
        this.queryParams = params;
        return this;
    }

    send(data: unknown = '') {
        this.bodyData = data;
        if (this.bodyType == null) {
            this.bodyType = typeof data === 'string' ? 'text' : 'json';
        }
        return this;
    }

    expect(status: number): this;
    expect(header: string, value: string | RegExp): this;
    expect(statusOrHeader: number | string, value?: string | RegExp) {
        if (typeof statusOrHeader === 'number') {
            this.expectations.push({ type: 'status', value: statusOrHeader });
            return this;
        }

        if (value != null) {
            this.expectations.push({
                type: 'header',
                name: statusOrHeader.toLowerCase(),
                value,
            });
        }
        return this;
    }

    then<TResult1 = HonoTestResponse, TResult2 = never>(
        onfulfilled?: ((value: HonoTestResponse) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
        return this.execute().then(onfulfilled, onrejected);
    }

    private async execute(): Promise<HonoTestResponse> {
        const headers = new Headers(this.headers);
        const cookie = this.cookieJar?.getHeader();
        if (cookie) {
            headers.set('Cookie', cookie);
        }

        const response = await this.app.request(this.buildPath(), {
            method: this.method,
            headers,
            body: this.buildBody(headers),
        });
        this.cookieJar?.store(response);

        const testResponse = await buildTestResponse(response);
        for (const expectation of this.expectations) {
            if (expectation.type === 'status') {
                expect(testResponse.status).toBe(expectation.value);
                continue;
            }

            if (expectation.value instanceof RegExp) {
                expect(testResponse.headers[expectation.name]).toMatch(expectation.value);
            } else {
                expect(testResponse.headers[expectation.name]).toBe(expectation.value);
            }
        }

        return testResponse;
    }

    private buildPath() {
        const url = new URL(this.path, 'http://localhost');
        if (this.queryParams) {
            for (const [key, value] of Object.entries(this.queryParams)) {
                if (value == null) continue;
                url.searchParams.set(key, String(value));
            }
        }
        return url.pathname + url.search;
    }

    private buildBody(headers: Headers): BodyInit | undefined {
        if (this.bodyData == null) return undefined;

        if (this.bodyType === 'form') {
            return formEncode(this.bodyData);
        }

        if (this.bodyType === 'json') {
            if (!headers.has('Content-Type')) {
                headers.set('Content-Type', 'application/json');
            }
            return JSON.stringify(this.bodyData);
        }

        return String(this.bodyData);
    }
}

class HonoTestClient {
    private readonly cookieJar = new CookieJar();

    constructor(private readonly app: HonoTestApp) {}

    get(path: string) {
        return new HonoTestRequest(this.app, 'GET', path, this.cookieJar);
    }

    post(path: string) {
        return new HonoTestRequest(this.app, 'POST', path, this.cookieJar);
    }

    put(path: string) {
        return new HonoTestRequest(this.app, 'PUT', path, this.cookieJar);
    }

    patch(path: string) {
        return new HonoTestRequest(this.app, 'PATCH', path, this.cookieJar);
    }

    delete(path: string) {
        return new HonoTestRequest(this.app, 'DELETE', path, this.cookieJar);
    }
}

export function request(app: HonoTestApp) {
    return new HonoTestClient(app);
}

request.agent = (app: HonoTestApp) => new HonoTestClient(app);

export type HonoTestAgent = HonoTestClient;
export type HonoTestRequestChain = HonoTestRequest;

async function buildTestResponse(response: Response): Promise<HonoTestResponse> {
    const text = await response.text();
    const headers = Object.fromEntries(
        [...response.headers.entries()].map(([key, value]) => [key.toLowerCase(), value]),
    );
    const contentType = headers['content-type'] ?? '';

    let body: unknown = {};
    if (contentType.includes('application/json') && text) {
        try {
            body = JSON.parse(text);
        } catch (error) {
            throw new Error(
                `Response declared application/json but body is not valid JSON: ${text.slice(0, 200)}`,
                { cause: error },
            );
        }
    }

    return {
        body,
        headers,
        raw: response,
        status: response.status,
        text,
    };
}

function formEncode(data: unknown) {
    const params = new URLSearchParams();

    if (data && typeof data === 'object') {
        for (const [key, value] of Object.entries(data)) {
            if (Array.isArray(value)) {
                for (const item of value) {
                    params.append(`${key}[]`, String(item));
                }
                continue;
            }

            if (value != null) {
                params.append(key, String(value));
            }
        }
    }

    return params.toString();
}

function splitSetCookie(header: string) {
    return header.split(/,(?=\s*[^;,]+=)/);
}
