import { Request } from 'express';
import { config } from '../config';
import { libs } from '../libs';
import { RequestUtils } from './request';
import { db } from '../tests/test-setup';
import { ValidationError } from '../error';
import { describe, expect, it, beforeAll, vi } from 'vitest';

let requestUtils: ReturnType<typeof RequestUtils>;

beforeAll(async () => {
    const mockContext = {
        db,
        config,
        libs,
        logger: { error: vi.fn(), info: vi.fn() },
        utils: {} as any,
        models: {} as any,
        errors: {
            ValidationError,
        },
    } as any;

    requestUtils = RequestUtils(mockContext);
});

describe.concurrent('extractIdsForDelete', () => {
    it('should extract single ID from params', () => {
        const req = {
            params: { id: '123' },
            body: {},
        } as unknown as Request;

        const ids = requestUtils.extractIdsForDelete(req);
        expect(ids).toEqual([123]);
    });

    it('should extract multiple IDs from body array', () => {
        const req = {
            params: {},
            body: { id: ['1', '2', '3'] },
        } as unknown as Request;

        const ids = requestUtils.extractIdsForDelete(req);
        expect(ids).toEqual([1, 2, 3]);
    });

    it('should filter out invalid IDs from body array', () => {
        const req = {
            params: {},
            body: { id: ['1', 'invalid', '3', 'NaN'] },
        } as unknown as Request;

        const ids = requestUtils.extractIdsForDelete(req);
        expect(ids).toEqual([1, 3]);
    });

    it('should prioritize body array over params when both are present', () => {
        const req = {
            params: { id: '999' },
            body: { id: ['1', '2', '3'] },
        } as unknown as Request;

        const ids = requestUtils.extractIdsForDelete(req);
        expect(ids).toEqual([1, 2, 3]);
    });

    it('should accept single ID from body when params.id is also present', () => {
        const req = {
            params: { id: '123' },
            body: { id: '456' },
        } as unknown as Request;

        const ids = requestUtils.extractIdsForDelete(req);
        expect(ids).toEqual([456]);
    });

    it('should throw ValidationError when body.id is not an array and params.id is not set', () => {
        const req = {
            params: {},
            body: { id: '123' },
        } as unknown as Request;

        try {
            requestUtils.extractIdsForDelete(req);
            expect.fail('Should have thrown ValidationError');
        } catch (error) {
            expect(error).toBeInstanceOf(ValidationError);
            expect((error as ValidationError).errors.id).toBe('IDs array is required');
        }
    });

    it('should throw ValidationError when no IDs are provided', () => {
        const req = {
            params: {},
            body: {},
        } as unknown as Request;

        try {
            requestUtils.extractIdsForDelete(req);
            expect.fail('Should have thrown ValidationError');
        } catch (error) {
            expect(error).toBeInstanceOf(ValidationError);
            expect((error as ValidationError).errors.id).toBe('No valid IDs provided');
        }
    });

    it('should throw ValidationError when body array contains only invalid IDs', () => {
        const req = {
            params: {},
            body: { id: ['invalid', 'NaN', 'not-a-number'] },
        } as unknown as Request;

        try {
            requestUtils.extractIdsForDelete(req);
            expect.fail('Should have thrown ValidationError');
        } catch (error) {
            expect(error).toBeInstanceOf(ValidationError);
            expect((error as ValidationError).errors.id).toBe('No valid IDs provided');
        }
    });

    it('should handle numeric IDs in body array', () => {
        const req = {
            params: {},
            body: { id: [1, 2, 3] },
        } as unknown as Request;

        const ids = requestUtils.extractIdsForDelete(req);
        expect(ids).toEqual([1, 2, 3]);
    });

    it('should handle mixed string and numeric IDs in body array', () => {
        const req = {
            params: {},
            body: { id: ['1', 2, '3', 4] },
        } as unknown as Request;

        const ids = requestUtils.extractIdsForDelete(req);
        expect(ids).toEqual([1, 2, 3, 4]);
    });

    it('should handle string ID in params', () => {
        const req = {
            params: { id: '42' },
            body: {},
        } as unknown as Request;

        const ids = requestUtils.extractIdsForDelete(req);
        expect(ids).toEqual([42]);
    });

    it('should handle empty body.id array', () => {
        const req = {
            params: {},
            body: { id: [] },
        } as unknown as Request;

        try {
            requestUtils.extractIdsForDelete(req);
            expect.fail('Should have thrown ValidationError');
        } catch (error) {
            expect(error).toBeInstanceOf(ValidationError);
            expect((error as ValidationError).errors.id).toBe('No valid IDs provided');
        }
    });
});

describe.concurrent('extractApiKey', () => {
    it('should extract API key from X-API-KEY header', () => {
        const req = {
            header: (name: string) => {
                if (name === 'X-API-KEY') return 'test-api-key-123';
                return undefined;
            },
        } as unknown as Request;

        const apiKey = requestUtils.extractApiKey(req);
        expect(apiKey).toBe('test-api-key-123');
    });

    it('should extract API key from Authorization Bearer token', () => {
        const req = {
            header: (name: string) => {
                if (name === 'Authorization') return 'Bearer my-bearer-token-456';
                return undefined;
            },
        } as unknown as Request;

        const apiKey = requestUtils.extractApiKey(req);
        expect(apiKey).toBe('my-bearer-token-456');
    });

    it('should prioritize Authorization Bearer over X-API-KEY', () => {
        const req = {
            header: (name: string) => {
                if (name === 'X-API-KEY') return 'x-api-key-value';
                if (name === 'Authorization') return 'Bearer bearer-token-value';
                return undefined;
            },
        } as unknown as Request;

        const apiKey = requestUtils.extractApiKey(req);
        expect(apiKey).toBe('bearer-token-value');
    });

    it('should return undefined when no API key headers present', () => {
        const req = {
            header: () => undefined,
        } as unknown as Request;

        const apiKey = requestUtils.extractApiKey(req);
        expect(apiKey).toBeUndefined();
    });

    it('should return undefined for non-Bearer Authorization header', () => {
        const req = {
            header: (name: string) => {
                if (name === 'Authorization') return 'Basic some-basic-auth';
                return undefined;
            },
        } as unknown as Request;

        const apiKey = requestUtils.extractApiKey(req);
        expect(apiKey).toBeUndefined();
    });
});

describe.concurrent('expectsJson', () => {
    it('should return true when Content-Type includes application/json', () => {
        const req = {
            header: (name: string) => {
                if (name === 'Content-Type') return 'application/json';
                return undefined;
            },
        } as unknown as Request;

        expect(requestUtils.expectsJson(req)).toBe(true);
    });

    it('should return true when Content-Type includes application/json with charset', () => {
        const req = {
            header: (name: string) => {
                if (name === 'Content-Type') return 'application/json; charset=utf-8';
                return undefined;
            },
        } as unknown as Request;

        expect(requestUtils.expectsJson(req)).toBe(true);
    });

    it('should return false when Content-Type is not JSON', () => {
        const req = {
            header: (name: string) => {
                if (name === 'Content-Type') return 'text/html';
                return undefined;
            },
        } as unknown as Request;

        expect(requestUtils.expectsJson(req)).toBe(false);
    });

    it('should return false when Content-Type header is not present', () => {
        const req = {
            header: () => undefined,
        } as unknown as Request;

        expect(requestUtils.expectsJson(req)).toBe(false);
    });
});

describe.concurrent('isApiRequest', () => {
    it('should return true for paths starting with /api/', () => {
        const req = {
            path: '/api/users',
            method: 'GET',
            header: () => undefined,
        } as unknown as Request;

        expect(requestUtils.isApiRequest(req)).toBe(true);
    });

    it('should return true when API key is present in X-API-KEY header', () => {
        const req = {
            path: '/some-path',
            method: 'GET',
            header: (name: string) => {
                if (name === 'X-API-KEY') return 'test-api-key';
                return undefined;
            },
        } as unknown as Request;

        expect(requestUtils.isApiRequest(req)).toBe(true);
    });

    it('should return true when API key is present in Authorization Bearer', () => {
        const req = {
            path: '/some-path',
            method: 'GET',
            header: (name: string) => {
                if (name === 'Authorization') return 'Bearer test-token';
                return undefined;
            },
        } as unknown as Request;

        expect(requestUtils.isApiRequest(req)).toBe(true);
    });

    it('should return true for GET request with Accept: application/json', () => {
        const req = {
            path: '/some-path',
            method: 'GET',
            header: (name: string) => {
                if (name === 'Accept') return 'application/json';
                return undefined;
            },
        } as unknown as Request;

        expect(requestUtils.isApiRequest(req)).toBe(true);
    });

    it('should return true for HEAD request with Accept: application/json', () => {
        const req = {
            path: '/some-path',
            method: 'HEAD',
            header: (name: string) => {
                if (name === 'Accept') return 'application/json';
                return undefined;
            },
        } as unknown as Request;

        expect(requestUtils.isApiRequest(req)).toBe(true);
    });

    it('should return true for POST with both Accept and Content-Type as JSON', () => {
        const req = {
            path: '/some-path',
            method: 'POST',
            header: (name: string) => {
                if (name === 'Accept') return 'application/json';
                if (name === 'Content-Type') return 'application/json';
                return undefined;
            },
        } as unknown as Request;

        expect(requestUtils.isApiRequest(req)).toBe(true);
    });

    it('should return false for POST with only Accept header as JSON', () => {
        const req = {
            path: '/some-path',
            method: 'POST',
            header: (name: string) => {
                if (name === 'Accept') return 'application/json';
                return undefined;
            },
        } as unknown as Request;

        expect(requestUtils.isApiRequest(req)).toBe(false);
    });

    it('should return false for POST with only Content-Type header as JSON', () => {
        const req = {
            path: '/some-path',
            method: 'POST',
            header: (name: string) => {
                if (name === 'Content-Type') return 'application/json';
                return undefined;
            },
        } as unknown as Request;

        expect(requestUtils.isApiRequest(req)).toBe(false);
    });

    it('should return false for regular HTML request', () => {
        const req = {
            path: '/some-page',
            method: 'GET',
            header: (name: string) => {
                if (name === 'Accept') return 'text/html';
                return undefined;
            },
        } as unknown as Request;

        expect(requestUtils.isApiRequest(req)).toBe(false);
    });

    it('should return false when no JSON headers and no API key', () => {
        const req = {
            path: '/some-path',
            method: 'GET',
            header: () => undefined,
        } as unknown as Request;

        expect(requestUtils.isApiRequest(req)).toBe(false);
    });
});

describe('canViewHiddenItems', () => {
    it('should return true when all conditions are met', () => {
        const now = Date.now();
        const req = {
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: now - 5 * 60 * 1000, // 5 minutes ago
            },
        } as unknown as Request;

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(true);
        expect(result.hasVerifiedPassword).toBe(true);
        expect(result.showHidden).toBe(true);
    });

    it('should return false when query.hidden is not "true"', () => {
        const now = Date.now();
        const req = {
            query: { hidden: 'false' },
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: now - 5 * 60 * 1000,
            },
        } as unknown as Request;

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(true);
        expect(result.showHidden).toBe(false);
    });

    it('should return false when query.hidden is missing', () => {
        const now = Date.now();
        const req = {
            query: {},
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: now - 5 * 60 * 1000,
            },
        } as unknown as Request;

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(true);
        expect(result.showHidden).toBe(false);
    });

    it('should return false when session is not verified', () => {
        const now = Date.now();
        const req = {
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerified: false,
                hiddenItemsVerifiedAt: now - 5 * 60 * 1000,
            },
        } as unknown as Request;

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(false);
        expect(result.showHidden).toBe(true);
    });

    it('should return false when session verification is expired (31 minutes old)', () => {
        const now = Date.now();
        const req = {
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: now - 31 * 60 * 1000, // 31 minutes ago
            },
        } as unknown as Request;

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(false);
        expect(result.showHidden).toBe(true);
    });

    it('should return true when verification is 29 minutes old (still valid)', () => {
        const now = Date.now();
        const req = {
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: now - 29 * 60 * 1000, // 29 minutes ago
            },
        } as unknown as Request;

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(true);
        expect(result.hasVerifiedPassword).toBe(true);
        expect(result.showHidden).toBe(true);
    });

    it('should return false when user does not have hidden_items_password', () => {
        const now = Date.now();
        const req = {
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: now - 5 * 60 * 1000,
            },
        } as unknown as Request;

        const user = {
            hidden_items_password: null,
        } as any;

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(true);
        expect(result.showHidden).toBe(true);
    });

    it('should return false when user has empty hidden_items_password', () => {
        const now = Date.now();
        const req = {
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: now - 5 * 60 * 1000,
            },
        } as unknown as Request;

        const user = {
            hidden_items_password: '',
        } as any;

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(true);
        expect(result.showHidden).toBe(true);
    });

    it('should return false when hiddenItemsVerifiedAt is missing', () => {
        const req = {
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: undefined,
            },
        } as unknown as Request;

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(false);
        expect(result.showHidden).toBe(true);
    });

    it('should return false when session is missing', () => {
        const req = {
            query: { hidden: 'true' },
            session: undefined,
        } as unknown as Request;

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(false);
        expect(result.showHidden).toBe(true);
    });

    it('should return false when hiddenItemsVerified is missing', () => {
        const now = Date.now();
        const req = {
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerifiedAt: now - 5 * 60 * 1000,
            },
        } as unknown as Request;

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(false);
        expect(result.showHidden).toBe(true);
    });

    it('should return true when verification is exactly at 30 minute boundary', () => {
        const now = Date.now();
        const req = {
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: now - 30 * 60 * 1000 + 1, // Just under 30 minutes
            },
        } as unknown as Request;

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItems(req, user);
        expect(result.canViewHidden).toBe(true);
        expect(result.hasVerifiedPassword).toBe(true);
        expect(result.showHidden).toBe(true);
    });
});
