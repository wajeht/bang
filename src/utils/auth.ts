import type { MagicLinkPayload, AppContext } from '../type.js';
import { sign, verify } from 'hono/jwt';

const JWT_ALGORITHM = 'HS256';
const MAGIC_LINK_TTL_SECONDS = 15 * 60;

export function createAuth(context: AppContext) {
    const logger = context.logger.tag('service', 'auth');
    return {
        async verifyMagicLink(token: string): Promise<MagicLinkPayload | null> {
            try {
                const payload = await verify(token, context.config.app.secretSalt, JWT_ALGORITHM);
                if (typeof payload.email !== 'string') return null;

                return {
                    email: payload.email,
                    exp: typeof payload.exp === 'number' ? payload.exp : undefined,
                };
            } catch (error) {
                logger.error('Failed to verify magic link token', { error });
                return null;
            }
        },

        async generateMagicLink(payload: MagicLinkPayload): Promise<string> {
            const issuedAt = Math.floor(Date.now() / 1000);
            return sign(
                {
                    ...payload,
                    iat: issuedAt,
                    exp: issuedAt + MAGIC_LINK_TTL_SECONDS,
                },
                context.config.app.secretSalt,
                JWT_ALGORITHM,
            );
        },
    };
}
