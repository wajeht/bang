import type { Request } from 'express';
import type { AppContext } from '../type';

const SENSITIVE_KEYS = new Set([
    'password',
    'token',
    'secret',
    'apikey',
    'api_key',
    'authorization',
]);

function sanitizeObject(obj: unknown, depth = 0): unknown {
    if (depth > 3 || obj == null) return obj;
    if (typeof obj !== 'object') return obj;
    if (Array.isArray(obj)) return obj.slice(0, 5).map((v) => sanitizeObject(v, depth + 1));

    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        if (SENSITIVE_KEYS.has(key.toLowerCase())) {
            result[key] = '[REDACTED]';
        } else {
            result[key] = sanitizeObject(value, depth + 1);
        }
    }
    return result;
}

function truncate(str: string, max: number): string {
    return str.length > max ? str.slice(0, max - 3) + '...' : str;
}

export function createDiscord(ctx: AppContext) {
    return {
        sendErrorNotification(req: Request, error: Error, statusCode: number): void {
            if (!ctx.config.notify.url) return;

            const user = req.session?.user || req.user;
            const stackLines = error.stack?.split('\n') || [];
            const appLines = stackLines.filter((line) => !line.includes('node_modules'));
            const stack = appLines.slice(0, 8).join('\n') || 'No stack trace';
            const query = Object.keys(req.query).length > 0 ? JSON.stringify(req.query) : null;
            const body = sanitizeObject(req.body);
            const bodyStr =
                body && Object.keys(body as object).length > 0 ? JSON.stringify(body) : null;

            const embed = {
                title: `${statusCode >= 500 ? '🔴' : '🟠'} ${statusCode} Error`,
                description: truncate(error.message, 256),
                color: statusCode >= 500 ? 0xff0000 : 0xffa500,
                fields: [
                    { name: 'Request', value: `\`${req.method} ${req.path}\``, inline: true },
                    { name: 'Status', value: `${statusCode}`, inline: true },
                    {
                        name: 'User',
                        value: user?.email || user?.id?.toString() || 'anonymous',
                        inline: true,
                    },
                    ...(query
                        ? [
                              {
                                  name: 'Query',
                                  value: `\`\`\`json\n${truncate(query, 200)}\`\`\``,
                                  inline: false,
                              },
                          ]
                        : []),
                    ...(bodyStr
                        ? [
                              {
                                  name: 'Body',
                                  value: `\`\`\`json\n${truncate(bodyStr, 300)}\`\`\``,
                                  inline: false,
                              },
                          ]
                        : []),
                    {
                        name: 'Stack',
                        value: `\`\`\`\n${truncate(stack, 500)}\`\`\``,
                        inline: false,
                    },
                ],
                timestamp: new Date().toISOString(),
                footer: { text: `${error.name} | ${ctx.config.app.env}` },
            };

            void fetch(ctx.config.notify.url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-KEY': ctx.config.notify.apiKey,
                },
                body: JSON.stringify({
                    message: `${req.method} ${req.path} - ${truncate(error.message, 100)}`,
                    embeds: [embed],
                }),
            }).catch((err) => ctx.logger.error('Discord notification failed', { error: err }));
        },
    };
}
