import { libs } from '../libs.js';
import type { HonoContext } from '../type.js';
import { config } from '../config.js';
import { createRequest } from './request.js';
import { db } from '../tests/test-setup.js';
import { ValidationError } from '../error.js';
import { describe, expect, it, beforeAll, vi } from 'vite-plus/test';

let requestUtils: ReturnType<typeof createRequest>;

interface TestRequest {
    body?: Record<string, any>;
    params?: Record<string, string | undefined>;
    query?: Record<string, string | undefined>;
    session?: Record<string, any>;
    user?: Record<string, any>;
}

function createTestContext(req: TestRequest): HonoContext {
    return {
        req: {
            param: () => req.params ?? {},
            query: () => req.query ?? {},
        },
        get: (key: string) => {
            if (key === 'body') return req.body ?? {};
            if (key === 'session') return req.session;
            if (key === 'user') return req.user;
            return undefined;
        },
    } as unknown as HonoContext;
}

beforeAll(async () => {
    const mockLogger = {
        error: vi.fn(),
        info: vi.fn(),
        tag: vi.fn().mockReturnThis(),
    };
    const mockContext = {
        db,
        config,
        libs,
        logger: mockLogger,
        utils: {} as any,
        models: {} as any,
        errors: {
            ValidationError,
        },
    } as any;

    requestUtils = createRequest(mockContext);
});

describe.concurrent('extractIdsForDelete', () => {
    it('should extract single ID from params', () => {
        const req = {
            params: { id: '123' },
            body: {},
        };

        const ids = requestUtils.extractIdsForDeleteFromContext(createTestContext(req));
        expect(ids).toEqual([123]);
    });

    it('should extract multiple IDs from body array', () => {
        const req = {
            params: {},
            body: { id: ['1', '2', '3'] },
        };

        const ids = requestUtils.extractIdsForDeleteFromContext(createTestContext(req));
        expect(ids).toEqual([1, 2, 3]);
    });

    it('should filter out invalid IDs from body array', () => {
        const req = {
            params: {},
            body: { id: ['1', 'invalid', '3', 'NaN'] },
        };

        const ids = requestUtils.extractIdsForDeleteFromContext(createTestContext(req));
        expect(ids).toEqual([1, 3]);
    });

    it('should prioritize body array over params when both are present', () => {
        const req = {
            params: { id: '999' },
            body: { id: ['1', '2', '3'] },
        };

        const ids = requestUtils.extractIdsForDeleteFromContext(createTestContext(req));
        expect(ids).toEqual([1, 2, 3]);
    });

    it('should accept single ID from body when params.id is also present', () => {
        const req = {
            params: { id: '123' },
            body: { id: '456' },
        };

        const ids = requestUtils.extractIdsForDeleteFromContext(createTestContext(req));
        expect(ids).toEqual([456]);
    });

    it('should throw ValidationError when body.id is not an array and params.id is not set', () => {
        const req = {
            params: {},
            body: { id: '123' },
        };

        try {
            requestUtils.extractIdsForDeleteFromContext(createTestContext(req));
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
        };

        try {
            requestUtils.extractIdsForDeleteFromContext(createTestContext(req));
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
        };

        try {
            requestUtils.extractIdsForDeleteFromContext(createTestContext(req));
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
        };

        const ids = requestUtils.extractIdsForDeleteFromContext(createTestContext(req));
        expect(ids).toEqual([1, 2, 3]);
    });

    it('should handle mixed string and numeric IDs in body array', () => {
        const req = {
            params: {},
            body: { id: ['1', 2, '3', 4] },
        };

        const ids = requestUtils.extractIdsForDeleteFromContext(createTestContext(req));
        expect(ids).toEqual([1, 2, 3, 4]);
    });

    it('should handle string ID in params', () => {
        const req = {
            params: { id: '42' },
            body: {},
        };

        const ids = requestUtils.extractIdsForDeleteFromContext(createTestContext(req));
        expect(ids).toEqual([42]);
    });

    it('should handle empty body.id array', () => {
        const req = {
            params: {},
            body: { id: [] },
        };

        try {
            requestUtils.extractIdsForDeleteFromContext(createTestContext(req));
            expect.fail('Should have thrown ValidationError');
        } catch (error) {
            expect(error).toBeInstanceOf(ValidationError);
            expect((error as ValidationError).errors.id).toBe('No valid IDs provided');
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

describe('canViewHiddenItems', () => {
    it('should return true when all conditions are met', () => {
        const now = Date.now();
        const req = {
            query: { hidden: 'true' },
            session: {
                hiddenItemsVerified: true,
                hiddenItemsVerifiedAt: now - 5 * 60 * 1000, // 5 minutes ago
            },
        };

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItemsFromContext(createTestContext(req), user);
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
        };

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItemsFromContext(createTestContext(req), user);
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
        };

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItemsFromContext(createTestContext(req), user);
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
        };

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItemsFromContext(createTestContext(req), user);
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
        };

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItemsFromContext(createTestContext(req), user);
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
        };

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItemsFromContext(createTestContext(req), user);
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
        };

        const user = {
            hidden_items_password: null,
        } as any;

        const result = requestUtils.canViewHiddenItemsFromContext(createTestContext(req), user);
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
        };

        const user = {
            hidden_items_password: '',
        } as any;

        const result = requestUtils.canViewHiddenItemsFromContext(createTestContext(req), user);
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
        };

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItemsFromContext(createTestContext(req), user);
        expect(result.canViewHidden).toBe(false);
        expect(result.hasVerifiedPassword).toBe(false);
        expect(result.showHidden).toBe(true);
    });

    it('should return false when session is missing', () => {
        const req = {
            query: { hidden: 'true' },
            session: undefined,
        };

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItemsFromContext(createTestContext(req), user);
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
        };

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItemsFromContext(createTestContext(req), user);
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
                hiddenItemsVerifiedAt: now - 29 * 60 * 1000, // Just under 30 minutes
            },
        };

        const user = {
            hidden_items_password: 'hashed-password',
        } as any;

        const result = requestUtils.canViewHiddenItemsFromContext(createTestContext(req), user);
        expect(result.canViewHidden).toBe(true);
        expect(result.hasVerifiedPassword).toBe(true);
        expect(result.showHidden).toBe(true);
    });
});
