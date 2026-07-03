import type { MagicLinkPayload, AppContext } from '../type.js';

export function createAuth(context: AppContext) {
    const logger = context.logger.tag('service', 'auth');
    return {
        verifyMagicLink(token: string): MagicLinkPayload | null {
            try {
                return context.libs.jwt.verify(
                    token,
                    context.config.app.secretSalt,
                ) as MagicLinkPayload;
            } catch (error) {
                logger.error('Failed to verify magic link token', { error });
                return null;
            }
        },

        generateMagicLink(payload: MagicLinkPayload): string {
            return context.libs.jwt.sign(payload, context.config.app.secretSalt, {
                expiresIn: '15m',
            });
        },
    };
}
