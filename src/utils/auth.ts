import type { ApiKeyPayload, MagicLinkPayload, AppContext } from '../type.js';

export function createAuth(context: AppContext) {
    const apiKeyPayload = context.libs.z.object({
        userId: context.libs.z.number().int().positive(),
        apiKeyVersion: context.libs.z.number().int().nonnegative(),
    });

    const magicLinkPayload = context.libs.z.object({
        email: context.libs.z
            .string()
            .refine((email) => context.utils.validation.isValidEmail(email)),
        exp: context.libs.z.number().optional(),
    });

    const logger = context.logger.tag('service', 'auth');

    return {
        async verifyApiKey(apiKey: string): Promise<ApiKeyPayload | null> {
            try {
                const decodedApiKeyPayload = apiKeyPayload.parse(
                    context.libs.jwt.verify(apiKey, context.config.app.apiKeySecret),
                );

                const app = await context
                    .db('users')
                    .where({
                        id: decodedApiKeyPayload.userId,
                        api_key: apiKey,
                        api_key_version: decodedApiKeyPayload.apiKeyVersion,
                    })
                    .first();

                if (!app) return null;

                return decodedApiKeyPayload;
            } catch (error) {
                logger.error('Failed to verify API key', { error });

                return null;
            }
        },

        async generateApiKey(payload: ApiKeyPayload): Promise<string> {
            return context.libs.jwt.sign(payload, context.config.app.apiKeySecret);
        },

        verifyMagicLink(token: string): MagicLinkPayload | null {
            try {
                return magicLinkPayload.parse(
                    context.libs.jwt.verify(token, context.config.app.secretSalt),
                );
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
