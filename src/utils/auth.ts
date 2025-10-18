import type { Request } from 'express';
import type { ApiKeyPayload, MagicLinkPayload, AppContext } from '../type';

export function createAuthUtils(context: AppContext) {
    function extractApiKey(req: Request): string | undefined {
        const apiKey = req.header('X-API-KEY');
        const authHeader = req.header('Authorization');

        if (authHeader?.startsWith('Bearer ')) {
            return authHeader.substring(7);
        }

        return apiKey;
    }

    function isApiRequest(req: Request): boolean {
        // Explicitly API routes always return true
        if (req.path.startsWith('/api/')) {
            return true;
        }

        // If an API key is provided, it's an API request
        if (extractApiKey(req)) {
            return true;
        }

        // For non-API routes, only treat as API if both:
        // 1. Accept header prefers JSON
        // 2. Content-Type is JSON (for POST/PUT requests)
        const acceptsJson = req.header('Accept')?.includes('application/json');
        const sendsJson = req.header('Content-Type')?.includes('application/json');

        // Only treat as API request if it's explicitly asking for JSON response
        // AND sending JSON data (for requests with body)
        if (req.method === 'GET' || req.method === 'HEAD') {
            return acceptsJson === true;
        }

        // For POST/PUT/DELETE, require both JSON content-type and accept header
        return acceptsJson === true && sendsJson === true;
    }

    function expectsJson(req: Request): boolean {
        return req.header('Content-Type')?.includes('application/json') || false;
    }

    async function generateApiKey(payload: ApiKeyPayload): Promise<string> {
        return context.libs.jwt.sign(payload, context.config.app.apiKeySecret);
    }

    async function verifyApiKey(apiKey: string): Promise<ApiKeyPayload | null> {
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
    }

    function generateMagicLink(payload: MagicLinkPayload): string {
        return context.libs.jwt.sign(payload, context.config.app.secretSalt, { expiresIn: '15m' });
    }

    function verifyMagicLink(token: string): MagicLinkPayload | null {
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
    }

    return {
        extractApiKey,
        isApiRequest,
        expectsJson,
        generateApiKey,
        verifyApiKey,
        generateMagicLink,
        verifyMagicLink,
    };
}
