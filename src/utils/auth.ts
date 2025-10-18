import type { Request } from 'express';
import type { ApiKeyPayload, MagicLinkPayload, AppContext } from '../type';

export function AuthUtils(context: AppContext) {
    return {
        expectsJson(req: Request): boolean {
            return req.header('Content-Type')?.includes('application/json') || false;
        },

        isApiRequest(req: Request): boolean {
            if (req.path.startsWith('/api/')) {
                return true;
            }

            if (this.extractApiKey(req)) {
                return true;
            }

            const acceptsJson = req.header('Accept')?.includes('application/json');
            const sendsJson = req.header('Content-Type')?.includes('application/json');

            if (req.method === 'GET' || req.method === 'HEAD') {
                return acceptsJson === true;
            }

            return acceptsJson === true && sendsJson === true;
        },

        async verifyApiKey(apiKey: string): Promise<ApiKeyPayload | null> {
            try {
                const decodedApiKeyPayload = context.libs.jwt.verify(
                    apiKey,
                    context.config.app.apiKeySecret,
                ) as ApiKeyPayload;

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
                context.logger.error(`[verifyApiKey]: failed to verify api key: %o`, { error });
                return null;
            }
        },

        extractApiKey(req: Request): string | undefined {
            const apiKey = req.header('X-API-KEY');
            const authHeader = req.header('Authorization');

            if (authHeader?.startsWith('Bearer ')) {
                return authHeader.substring(7);
            }

            return apiKey;
        },

        async generateApiKey(payload: ApiKeyPayload): Promise<string> {
            return context.libs.jwt.sign(payload, context.config.app.apiKeySecret);
        },

        verifyMagicLink(token: string): MagicLinkPayload | null {
            try {
                return context.libs.jwt.verify(
                    token,
                    context.config.app.secretSalt,
                ) as MagicLinkPayload;
            } catch (error) {
                context.logger.error(`[verifyMagicLink]: failed to verify magic link token: %o`, {
                    error,
                });
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
