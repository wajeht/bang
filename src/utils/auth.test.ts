import { libs } from '../libs';
import { config } from '../config';
import { AuthUtils } from './auth';
import { db } from '../tests/test-setup';
import type { ApiKeyPayload, MagicLinkPayload } from '../type';
import { describe, expect, it, beforeAll, afterAll, vi } from 'vitest';

let authUtils: ReturnType<typeof AuthUtils>;

beforeAll(async () => {
    const mockContext = {
        db,
        config,
        libs,
        logger: { error: vi.fn(), info: vi.fn() },
        utils: {} as any,
        models: {} as any,
        errors: {} as any,
    } as any;

    authUtils = AuthUtils(mockContext);

    await db('users').insert({
        id: 999,
        username: 'test-auth-user',
        email: 'test-auth@example.com',
        api_key: 'will-be-set-in-test',
        api_key_version: 1,
    });
});

afterAll(async () => {
    await db('users').where({ id: 999 }).delete();
});

describe.concurrent('generateApiKey', () => {
    it('should generate a valid JWT API key', async () => {
        const payload: ApiKeyPayload = {
            userId: 999,
            apiKeyVersion: 1,
        };

        const apiKey = await authUtils.generateApiKey(payload);

        expect(apiKey).toBeDefined();
        expect(typeof apiKey).toBe('string');
        expect(apiKey.length).toBeGreaterThan(0);

        // Verify it's a valid JWT by decoding it
        const decoded = libs.jwt.verify(apiKey, config.app.apiKeySecret) as ApiKeyPayload;
        expect(decoded.userId).toBe(payload.userId);
        expect(decoded.apiKeyVersion).toBe(payload.apiKeyVersion);
    });

    it('should generate different keys for different users', async () => {
        const payload1: ApiKeyPayload = { userId: 1, apiKeyVersion: 1 };
        const payload2: ApiKeyPayload = { userId: 2, apiKeyVersion: 1 };

        const apiKey1 = await authUtils.generateApiKey(payload1);
        const apiKey2 = await authUtils.generateApiKey(payload2);

        expect(apiKey1).not.toBe(apiKey2);
    });

    it('should generate different keys for different versions', async () => {
        const payload1: ApiKeyPayload = { userId: 1, apiKeyVersion: 1 };
        const payload2: ApiKeyPayload = { userId: 1, apiKeyVersion: 2 };

        const apiKey1 = await authUtils.generateApiKey(payload1);
        const apiKey2 = await authUtils.generateApiKey(payload2);

        expect(apiKey1).not.toBe(apiKey2);
    });
});

describe('verifyApiKey', () => {
    it('should verify a valid API key that exists in database', async () => {
        const payload: ApiKeyPayload = {
            userId: 999,
            apiKeyVersion: 1,
        };

        const apiKey = await authUtils.generateApiKey(payload);

        // Update user with the generated API key
        await db('users').where({ id: 999 }).update({ api_key: apiKey });

        const result = await authUtils.verifyApiKey(apiKey);

        expect(result).not.toBeNull();
        expect(result?.userId).toBe(999);
        expect(result?.apiKeyVersion).toBe(1);
    });

    it('should return null for API key not in database', async () => {
        const payload: ApiKeyPayload = {
            userId: 999,
            apiKeyVersion: 1,
        };

        const apiKey = await authUtils.generateApiKey(payload);
        // Don't update the database, so the key is valid JWT but not in DB

        await db('users').where({ id: 999 }).update({ api_key: 'different-key' });

        const result = await authUtils.verifyApiKey(apiKey);

        expect(result).toBeNull();
    });

    it('should return null for invalid JWT format', async () => {
        const result = await authUtils.verifyApiKey('invalid-jwt-token');

        expect(result).toBeNull();
    });

    it('should return null for API key with wrong version', async () => {
        const payload: ApiKeyPayload = {
            userId: 999,
            apiKeyVersion: 1,
        };

        const apiKey = await authUtils.generateApiKey(payload);

        // Update user with the API key but different version
        await db('users').where({ id: 999 }).update({ api_key: apiKey, api_key_version: 2 });

        const result = await authUtils.verifyApiKey(apiKey);

        expect(result).toBeNull();
    });

    it('should return null for API key with non-existent user', async () => {
        const payload: ApiKeyPayload = {
            userId: 99999, // Non-existent user
            apiKeyVersion: 1,
        };

        const apiKey = await authUtils.generateApiKey(payload);

        const result = await authUtils.verifyApiKey(apiKey);

        expect(result).toBeNull();
    });

    it('should return null for malformed token', async () => {
        const result = await authUtils.verifyApiKey('not.a.jwt');

        expect(result).toBeNull();
    });
});

describe.concurrent('generateMagicLink', () => {
    it('should generate a valid magic link JWT', () => {
        const payload: MagicLinkPayload = {
            email: 'test@example.com',
        };

        const token = authUtils.generateMagicLink(payload);

        expect(token).toBeDefined();
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);

        // Verify it's a valid JWT by decoding it
        const decoded = libs.jwt.verify(token, config.app.secretSalt) as MagicLinkPayload;
        expect(decoded.email).toBe(payload.email);
    });

    it('should generate tokens with expiration', () => {
        const payload: MagicLinkPayload = {
            email: 'test@example.com',
        };

        const token = authUtils.generateMagicLink(payload);
        const decoded = libs.jwt.decode(token) as any;

        expect(decoded.exp).toBeDefined();
        expect(decoded.iat).toBeDefined();
        // Should expire in 15 minutes (900 seconds)
        expect(decoded.exp - decoded.iat).toBe(900);
    });

    it('should generate different tokens for different emails', () => {
        const payload1: MagicLinkPayload = { email: 'user1@example.com' };
        const payload2: MagicLinkPayload = { email: 'user2@example.com' };

        const token1 = authUtils.generateMagicLink(payload1);
        const token2 = authUtils.generateMagicLink(payload2);

        expect(token1).not.toBe(token2);
    });
});

describe.concurrent('verifyMagicLink', () => {
    it('should verify a valid magic link token', () => {
        const payload: MagicLinkPayload = {
            email: 'test@example.com',
        };

        const token = authUtils.generateMagicLink(payload);
        const result = authUtils.verifyMagicLink(token);

        expect(result).not.toBeNull();
        expect(result?.email).toBe('test@example.com');
    });

    it('should return null for invalid token format', () => {
        const result = authUtils.verifyMagicLink('invalid-token');

        expect(result).toBeNull();
    });

    it('should return null for malformed JWT', () => {
        const result = authUtils.verifyMagicLink('not.a.valid.jwt');

        expect(result).toBeNull();
    });

    it('should return null for token with wrong secret', () => {
        // Generate token with a different secret
        const wrongToken = libs.jwt.sign({ email: 'test@example.com' }, 'wrong-secret', {
            expiresIn: '15m',
        });

        const result = authUtils.verifyMagicLink(wrongToken);

        expect(result).toBeNull();
    });

    it('should return null for expired token', () => {
        // Generate a token that's already expired
        const expiredToken = libs.jwt.sign(
            { email: 'test@example.com' },
            config.app.secretSalt,
            { expiresIn: '-1s' }, // Expired 1 second ago
        );

        const result = authUtils.verifyMagicLink(expiredToken);

        expect(result).toBeNull();
    });

    it('should return null for empty token', () => {
        const result = authUtils.verifyMagicLink('');

        expect(result).toBeNull();
    });
});
