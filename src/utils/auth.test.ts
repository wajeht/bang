import { libs } from '../libs.js';
import { config } from '../config.js';
import { createAuth } from './auth.js';
import { db } from '../tests/test-setup.js';
import type { MagicLinkPayload } from '../type.js';
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
