import { createUserFixture } from '../tests/test-db.js';
import { createRequestFixture } from '../tests/http-fixtures.js';

import { createRequest } from './request.js';
import { ctx } from '../tests/test-setup.js';
import { ValidationError } from '../error.js';
import { describe, expect, it, beforeAll } from 'vite-plus/test';

let requestUtils: ReturnType<typeof createRequest>;

beforeAll(() => {
    requestUtils = ctx.utils.request;
});

describe.concurrent('extractIdsForDelete', () => {
    it('should extract single ID from params', () => {
        const req = createRequestFixture({
            params: { id: '123' },
            body: {},
        });

        const ids = requestUtils.extractIdsForDelete(req);
        expect(ids).toEqual([123]);
    });

    it('should extract multiple IDs from body array', () => {
        const req = createRequestFixture({
            params: {},
            body: { id: ['1', '2', '3'] },
        });

        const ids = requestUtils.extractIdsForDelete(req);
        expect(ids).toEqual([1, 2, 3]);
    });

    it('should filter out invalid IDs from body array', () => {
        const req = createRequestFixture({
            params: {},
            body: { id: ['1', 'invalid', '3', 'NaN'] },
        });

        const ids = requestUtils.extractIdsForDelete(req);
        expect(ids).toEqual([1, 3]);
    });

    it('should prioritize body array over params when both are present', () => {
        const req = createRequestFixture({
            params: { id: '999' },
            body: { id: ['1', '2', '3'] },
        });

        const ids = requestUtils.extractIdsForDelete(req);
        expect(ids).toEqual([1, 2, 3]);
    });

    it('should accept single ID from body when params.id is also present', () => {
        const req = createRequestFixture({
            params: { id: '123' },
            body: { id: '456' },
        });

        const ids = requestUtils.extractIdsForDelete(req);
        expect(ids).toEqual([456]);
    });

    it('should throw ValidationError when body.id is not an array and params.id is not set', () => {
        const req = createRequestFixture({
            params: {},
            body: { id: '123' },
        });

        try {
            requestUtils.extractIdsForDelete(req);
            expect.fail('Should have thrown ValidationError');
        } catch (error) {
            expect(error).toBeInstanceOf(ValidationError);

            if (!(error instanceof ValidationError)) throw error;
            expect(error.errors.id).toBe('IDs array is required');
        }
    });

    it('should throw ValidationError when no IDs are provided', () => {
        const req = createRequestFixture({
            params: {},
            body: {},
        });

        try {
            requestUtils.extractIdsForDelete(req);
            expect.fail('Should have thrown ValidationError');
        } catch (error) {
            expect(error).toBeInstanceOf(ValidationError);

            if (!(error instanceof ValidationError)) throw error;
            expect(error.errors.id).toBe('No valid IDs provided');
        }
    });

    it('should throw ValidationError when body array contains only invalid IDs', () => {
        const req = createRequestFixture({
            params: {},
            body: { id: ['invalid', 'NaN', 'not-a-number'] },
        });

        try {
            requestUtils.extractIdsForDelete(req);
            expect.fail('Should have thrown ValidationError');
        } catch (error) {
            expect(error).toBeInstanceOf(ValidationError);

            if (!(error instanceof ValidationError)) throw error;
            expect(error.errors.id).toBe('No valid IDs provided');
        }
    });

    it('should handle numeric IDs in body array', () => {
        const req = createRequestFixture({
            params: {},
            body: { id: [1, 2, 3] },
        });

        const ids = requestUtils.extractIdsForDelete(req);
        expect(ids).toEqual([1, 2, 3]);
    });

    it('should handle mixed string and numeric IDs in body array', () => {
        const req = createRequestFixture({
            params: {},
            body: { id: ['1', 2, '3', 4] },
        });

        const ids = requestUtils.extractIdsForDelete(req);
        expect(ids).toEqual([1, 2, 3, 4]);
    });

    it('should handle string ID in params', () => {
        const req = createRequestFixture({
            params: { id: '42' },
            body: {},
        });

        const ids = requestUtils.extractIdsForDelete(req);
        expect(ids).toEqual([42]);
    });

    it('should handle empty body.id array', () => {
        const req = createRequestFixture({
            params: {},
            body: { id: [] },
        });

        try {
            requestUtils.extractIdsForDelete(req);
            expect.fail('Should have thrown ValidationError');
        } catch (error) {
            expect(error).toBeInstanceOf(ValidationError);

            if (!(error instanceof ValidationError)) throw error;
            expect(error.errors.id).toBe('No valid IDs provided');
        }
    });
});

describe.concurrent('getSafeRedirectPath', () => {
    it('should return / when input is empty or undefined', () => {
        expect(requestUtils.getSafeRedirectPath('')).toBe('/');
        expect(requestUtils.getSafeRedirectPath(undefined)).toBe('/');
    });

    it('should return the same pathname for a normal absolute path', () => {
        expect(requestUtils.getSafeRedirectPath('/notes/42')).toBe('/notes/42');
    });

    it('should preserve query strings', () => {
        expect(requestUtils.getSafeRedirectPath('/notes?page=2&sort=desc')).toBe(
            '/notes?page=2&sort=desc',
        );
    });

    it('should strip leading double slashes that look like protocol-relative URLs', () => {
        expect(requestUtils.getSafeRedirectPath('//evil.com/steal')).toBe('/evil.com/steal');
        expect(requestUtils.getSafeRedirectPath('///evil.com')).toBe('/evil.com');
    });

    it('should strip absolute external URLs to their pathname only', () => {
        // 'http://localhost' + 'http://evil.com/x' parses to host=localhosthttp:, pathname=//evil.com/x
        // After collapsing leading slashes the host is removed.
        expect(requestUtils.getSafeRedirectPath('http://evil.com/x')).toBe('/evil.com/x');
    });

    it('should append extraQuery params when provided', () => {
        const result = requestUtils.getSafeRedirectPath('/notes/42', {
            'verify-password-modal': 'true',
        });

        expect(result).toBe('/notes/42?verify-password-modal=true');
    });

    it('should overwrite same-named query params with extraQuery values', () => {
        const result = requestUtils.getSafeRedirectPath('/notes?modal=false', {
            modal: 'true',
        });

        expect(result).toBe('/notes?modal=true');
    });

    it('should still strip leading slashes when extraQuery is provided', () => {
        const result = requestUtils.getSafeRedirectPath('//evil.com/x', {
            'verify-password-modal': 'true',
        });

        expect(result).toBe('/evil.com/x?verify-password-modal=true');
    });
});

describe.concurrent('extractApiKey', () => {
    it('should extract API key from X-API-KEY header', () => {
        const req = createRequestFixture({
            header: (name: string) => {
                if (name === 'X-API-KEY') return 'test-api-key-123';

                return undefined;
            },
        });

        const apiKey = requestUtils.extractApiKey(req);
        expect(apiKey).toBe('test-api-key-123');
    });

    it('should extract API key from Authorization Bearer token', () => {
        const req = createRequestFixture({
            header: (name: string) => {
                if (name === 'Authorization') return 'Bearer my-bearer-token-456';

                return undefined;
            },
        });

        const apiKey = requestUtils.extractApiKey(req);
        expect(apiKey).toBe('my-bearer-token-456');
    });

    it('should prioritize Authorization Bearer over X-API-KEY', () => {
        const req = createRequestFixture({
            header: (name: string) => {
                if (name === 'X-API-KEY') return 'x-api-key-value';

                if (name === 'Authorization') return 'Bearer bearer-token-value';

                return undefined;
            },
        });

        const apiKey = requestUtils.extractApiKey(req);
        expect(apiKey).toBe('bearer-token-value');
    });

    it('should return undefined when no API key headers present', () => {
        const req = createRequestFixture({
            header: () => undefined,
        });

        const apiKey = requestUtils.extractApiKey(req);
        expect(apiKey).toBeUndefined();
    });

    it('should return undefined for non-Bearer Authorization header', () => {
        const req = createRequestFixture({
            header: (name: string) => {
                if (name === 'Authorization') return 'Basic some-basic-auth';

                return undefined;
            },
        });

        const apiKey = requestUtils.extractApiKey(req);
        expect(apiKey).toBeUndefined();
    });
});

describe.concurrent('expectsJson', () => {
    it('should return true when Content-Type includes application/json', () => {
        const req = createRequestFixture({
            header: (name: string) => {
                if (name === 'Content-Type') return 'application/json';

                return undefined;
            },
        });

        expect(requestUtils.expectsJson(req)).toBe(true);
    });

    it('should return true when Content-Type includes application/json with charset', () => {
        const req = createRequestFixture({
            header: (name: string) => {
                if (name === 'Content-Type') return 'application/json; charset=utf-8';

                return undefined;
            },
        });

        expect(requestUtils.expectsJson(req)).toBe(true);
    });

    it('should return false when Content-Type is not JSON', () => {
        const req = createRequestFixture({
            header: (name: string) => {
                if (name === 'Content-Type') return 'text/html';

                return undefined;
            },
        });

        expect(requestUtils.expectsJson(req)).toBe(false);
    });

    it('should return false when Content-Type header is not present', () => {
        const req = createRequestFixture({
            header: () => undefined,
        });

        expect(requestUtils.expectsJson(req)).toBe(false);
    });
});

describe.concurrent('isApiRequest', () => {
    it('should return true for paths starting with /api/', () => {
        const req = createRequestFixture({
            path: '/api/users',
            method: 'GET',
            header: () => undefined,
        });

        expect(requestUtils.isApiRequest(req)).toBe(true);
    });

    it('should return true when API key is present in X-API-KEY header', () => {
        const req = createRequestFixture({
            path: '/some-path',
            method: 'GET',
            header: (name: string) => {
                if (name === 'X-API-KEY') return 'test-api-key';

                return undefined;
            },
        });

        expect(requestUtils.isApiRequest(req)).toBe(true);
    });

    it('should return true when API key is present in Authorization Bearer', () => {
        const req = createRequestFixture({
            path: '/some-path',
            method: 'GET',
            header: (name: string) => {
                if (name === 'Authorization') return 'Bearer test-token';

                return undefined;
            },
        });

        expect(requestUtils.isApiRequest(req)).toBe(true);
    });

    it('should return true for GET request with Accept: application/json', () => {
        const req = createRequestFixture({
            path: '/some-path',
            method: 'GET',
            header: (name: string) => {
                if (name === 'Accept') return 'application/json';

                return undefined;
            },
        });

        expect(requestUtils.isApiRequest(req)).toBe(true);
    });

    it('should return true for HEAD request with Accept: application/json', () => {
        const req = createRequestFixture({
            path: '/some-path',
            method: 'HEAD',
            header: (name: string) => {
                if (name === 'Accept') return 'application/json';

                return undefined;
            },
        });

        expect(requestUtils.isApiRequest(req)).toBe(true);
    });

    it('should return true for POST with both Accept and Content-Type as JSON', () => {
        const req = createRequestFixture({
            path: '/some-path',
            method: 'POST',
            header: (name: string) => {
                if (name === 'Accept') return 'application/json';

                if (name === 'Content-Type') return 'application/json';

                return undefined;
            },
        });

        expect(requestUtils.isApiRequest(req)).toBe(true);
    });

    it('should return false for POST with only Accept header as JSON', () => {
        const req = createRequestFixture({
            path: '/some-path',
            method: 'POST',
            header: (name: string) => {
                if (name === 'Accept') return 'application/json';

                return undefined;
            },
        });

        expect(requestUtils.isApiRequest(req)).toBe(false);
    });

    it('should return false for POST with only Content-Type header as JSON', () => {
        const req = createRequestFixture({
            path: '/some-path',
            method: 'POST',
            header: (name: string) => {
                if (name === 'Content-Type') return 'application/json';

                return undefined;
            },
        });

        expect(requestUtils.isApiRequest(req)).toBe(false);
    });

    it('should return false for regular HTML request', () => {
        const req = createRequestFixture({
            path: '/some-page',
            method: 'GET',
            header: (name: string) => {
                if (name === 'Accept') return 'text/html';

                return undefined;
            },
        });

        expect(requestUtils.isApiRequest(req)).toBe(false);
    });

    it('should return false when no JSON headers and no API key', () => {
        const req = createRequestFixture({
            path: '/some-path',
            method: 'GET',
            header: () => undefined,
        });

        expect(requestUtils.isApiRequest(req)).toBe(false);
    });
});

describe('canViewHiddenItems', () => {
    it('should return true when all conditions are met', () => {
        const now = Date.now();

        const req = createRequestFixture({
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: now - 5 * 60 * 1000, // 5 minutes ago
            },
        });

        const user = createUserFixture({
            hidden_items_password: 'hashed-password',
        });

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(true);
        expect(result.hasVerifiedPassword).toBe(true);
        expect(result.showHidden).toBe(true);
    });

    it('should return false when query.hidden is not "true"', () => {
        const now = Date.now();

        const req = createRequestFixture({
            query: { hidden: 'false' },
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: now - 5 * 60 * 1000,
            },
        });

        const user = createUserFixture({
            hidden_items_password: 'hashed-password',
        });

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(true);
        expect(result.showHidden).toBe(false);
    });

    it('should return false when query.hidden is missing', () => {
        const now = Date.now();

        const req = createRequestFixture({
            query: {},
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: now - 5 * 60 * 1000,
            },
        });

        const user = createUserFixture({
            hidden_items_password: 'hashed-password',
        });

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(true);
        expect(result.showHidden).toBe(false);
    });

    it('should return false when session is not verified', () => {
        const now = Date.now();

        const req = createRequestFixture({
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerified: false,
                hiddenItemsVerifiedAt: now - 5 * 60 * 1000,
            },
        });

        const user = createUserFixture({
            hidden_items_password: 'hashed-password',
        });

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(false);
        expect(result.showHidden).toBe(true);
    });

    it('should return false when session verification is expired (31 minutes old)', () => {
        const now = Date.now();

        const req = createRequestFixture({
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: now - 31 * 60 * 1000, // 31 minutes ago
            },
        });

        const user = createUserFixture({
            hidden_items_password: 'hashed-password',
        });

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(false);
        expect(result.showHidden).toBe(true);
    });

    it('should return true when verification is 29 minutes old (still valid)', () => {
        const now = Date.now();

        const req = createRequestFixture({
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: now - 29 * 60 * 1000, // 29 minutes ago
            },
        });

        const user = createUserFixture({
            hidden_items_password: 'hashed-password',
        });

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(true);
        expect(result.hasVerifiedPassword).toBe(true);
        expect(result.showHidden).toBe(true);
    });

    it('should return false when user does not have hidden_items_password', () => {
        const now = Date.now();

        const req = createRequestFixture({
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: now - 5 * 60 * 1000,
            },
        });

        const user = createUserFixture({
            hidden_items_password: null,
        });

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(true);
        expect(result.showHidden).toBe(true);
    });

    it('should return false when user has empty hidden_items_password', () => {
        const now = Date.now();

        const req = createRequestFixture({
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: now - 5 * 60 * 1000,
            },
        });

        const user = createUserFixture({
            hidden_items_password: '',
        });

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(true);
        expect(result.showHidden).toBe(true);
    });

    it('should return false when hiddenItemsVerifiedAt is missing', () => {
        const req = createRequestFixture({
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: undefined,
            },
        });

        const user = createUserFixture({
            hidden_items_password: 'hashed-password',
        });

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(false);
        expect(result.showHidden).toBe(true);
    });

    it('should return false when session is missing', () => {
        const req = createRequestFixture({
            query: { hidden: 'true' },
            session: undefined,
        });

        const user = createUserFixture({
            hidden_items_password: 'hashed-password',
        });

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(false);
        expect(result.showHidden).toBe(true);
    });

    it('should return false when hiddenItemsVerified is missing', () => {
        const now = Date.now();

        const req = createRequestFixture({
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerifiedAt: now - 5 * 60 * 1000,
            },
        });

        const user = createUserFixture({
            hidden_items_password: 'hashed-password',
        });

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(false);
        expect(result.showHidden).toBe(true);
    });

    it('should return true when verification is exactly at 30 minute boundary', () => {
        const now = Date.now();

        const req = createRequestFixture({
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: now - 29 * 60 * 1000, // Just under 30 minutes
            },
        });

        const user = createUserFixture({
            hidden_items_password: 'hashed-password',
        });

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(true);
        expect(result.hasVerifiedPassword).toBe(true);
        expect(result.showHidden).toBe(true);
    });
});
