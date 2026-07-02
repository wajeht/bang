import { libs } from '../libs.js';
import { config } from '../config.js';
import { createAuth } from './auth.js';
import { db } from '../tests/test-setup.js';
import type { MagicLinkPayload } from '../type.js';
import { decode, sign, verify } from 'hono/jwt';
import { describe, expect, it, beforeAll, vi } from 'vite-plus/test';

let authUtils: ReturnType<typeof createAuth>;

beforeAll(async () => {
    const mockContext = {
        db,
        config,
        libs,
        logger: { error: vi.fn(), info: vi.fn(), tag: vi.fn().mockReturnThis() },
        utils: {} as any,
        models: {} as any,
        errors: {} as any,
    } as any;

    authUtils = createAuth(mockContext);
});

describe.concurrent('generateMagicLink', () => {
    it('should generate a valid magic link JWT', async () => {
        const payload: MagicLinkPayload = {
            email: 'test@example.com',
        };

        const token = await authUtils.generateMagicLink(payload);

        expect(token).toBeDefined();
        expect(typeof token).toBe('string');
        expect(token.length).toBeGreaterThan(0);

        // Verify it's a valid JWT by decoding it
        const decoded = (await verify(token, config.app.secretSalt, 'HS256')) as MagicLinkPayload;
        expect(decoded.email).toBe(payload.email);
    });

    it('should generate tokens with expiration', async () => {
        const payload: MagicLinkPayload = {
            email: 'test@example.com',
        };

        const token = await authUtils.generateMagicLink(payload);
        const decoded = decode(token).payload as any;

        expect(decoded.exp).toBeDefined();
        expect(decoded.iat).toBeDefined();
        // Should expire in 15 minutes (900 seconds)
        expect(decoded.exp - decoded.iat).toBe(900);
    });

    it('should generate different tokens for different emails', async () => {
        const payload1: MagicLinkPayload = { email: 'user1@example.com' };
        const payload2: MagicLinkPayload = { email: 'user2@example.com' };

        const token1 = await authUtils.generateMagicLink(payload1);
        const token2 = await authUtils.generateMagicLink(payload2);

        expect(token1).not.toBe(token2);
    });
});

describe.concurrent('verifyMagicLink', () => {
    it('should verify a valid magic link token', async () => {
        const payload: MagicLinkPayload = {
            email: 'test@example.com',
        };

        const token = await authUtils.generateMagicLink(payload);
        const result = await authUtils.verifyMagicLink(token);

        expect(result).not.toBeNull();
        expect(result?.email).toBe('test@example.com');
    });

    it('should return null for invalid token format', async () => {
        const result = await authUtils.verifyMagicLink('invalid-token');

        expect(result).toBeNull();
    });

    it('should return null for malformed JWT', async () => {
        const result = await authUtils.verifyMagicLink('not.a.valid.jwt');

        expect(result).toBeNull();
    });

    it('should return null for token with wrong secret', async () => {
        // Generate token with a different secret
        const now = Math.floor(Date.now() / 1000);
        const wrongToken = await sign(
            { email: 'test@example.com', iat: now, exp: now + 900 },
            'wrong-secret',
            'HS256',
        );

        const result = await authUtils.verifyMagicLink(wrongToken);

        expect(result).toBeNull();
    });

    it('should return null for expired token', async () => {
        // Generate a token that's already expired
        const now = Math.floor(Date.now() / 1000);
        const expiredToken = await sign(
            { email: 'test@example.com', iat: now - 901, exp: now - 1 },
            config.app.secretSalt,
            'HS256',
        );

        const result = await authUtils.verifyMagicLink(expiredToken);

        expect(result).toBeNull();
    });

    it('should return null for empty token', async () => {
        const result = await authUtils.verifyMagicLink('');

        expect(result).toBeNull();
    });
});
