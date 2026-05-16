import type { Request } from 'express';
import type { AppContext } from '../type.js';

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

export function createNtfy(ctx: AppContext) {
    return {
        sendErrorNotification(req: Request, error: Error, statusCode: number): void {
            if (!ctx.config.ntfy.url || !ctx.config.ntfy.topic) return;

            const user = req.session?.user || req.user;
            const stackLines = error.stack?.split('\n') || [];
            const appLines = stackLines.filter((line) => !line.includes('node_modules'));
            const stack = appLines.slice(0, 8).join('\n') || 'No stack trace';
            const query = Object.keys(req.query).length > 0 ? JSON.stringify(req.query) : null;
            const body = sanitizeObject(req.body);
            const bodyStr =
                body && Object.keys(body as object).length > 0 ? JSON.stringify(body) : null;

            const userLabel = user?.email || user?.id?.toString() || 'anonymous';
            const lines = [
                `${req.method} ${req.path} → ${statusCode}`,
                `User: ${userLabel}`,
                ...(query ? [`Query: ${truncate(query, 200)}`] : []),
                ...(bodyStr ? [`Body: ${truncate(bodyStr, 300)}`] : []),
                '',
                'Stack:',
                truncate(stack, 1500),
            ];
            const message = lines.join('\n');

            const headers: Record<string, string> = {
                'Content-Type': 'text/plain',
                Title: `${statusCode} ${error.name}: ${truncate(error.message, 120)}`,
                Priority: statusCode >= 500 ? '4' : '3',
                Tags: statusCode >= 500 ? 'rotating_light' : 'warning',
            };
            if (ctx.config.ntfy.token) {
                headers.Authorization = `Bearer ${ctx.config.ntfy.token}`;
            }

            const endpoint = `${ctx.config.ntfy.url.replace(/\/$/, '')}/${ctx.config.ntfy.topic}`;

            void fetch(endpoint, {
                method: 'POST',
                headers,
                body: message,
                signal: AbortSignal.timeout(5000),
            }).catch((err) => ctx.logger.error('ntfy notification failed', { error: err }));
        },
    };
}
