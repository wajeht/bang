import type { Request } from 'express';
import type { AppContext } from '../type.js';

const SENSITIVE_KEYS = new Set(['password', 'token', 'secret', 'apikey', 'authorization']);

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

function describeCause(cause: unknown): string | undefined {
    if (cause == null) return undefined;
    if (cause instanceof Error) return `${cause.name}: ${cause.message}`;
    if (typeof cause === 'string') return cause;
    try {
        return JSON.stringify(cause);
    } catch {
        return '[unserializable cause]';
    }
}

export function createNtfy(ctx: AppContext) {
    return {
        sendErrorNotification(req: Request, error: Error, statusCode: number): void {
            if (!ctx.config.ntfy.url || !ctx.config.ntfy.topic) return;

            const user = req.session?.user || req.user;
            const stackLines = error.stack?.split('\n') || [];
            const appLines = stackLines.filter((line) => !line.includes('node_modules'));
            const stack = appLines.slice(0, 8).join('\n') || 'No stack trace';
            const query = Object.keys(req.query).length > 0 ? JSON.stringify(req.query) : undefined;
            const body = sanitizeObject(req.body);
            const bodyStr =
                body && Object.keys(body as object).length > 0 ? JSON.stringify(body) : undefined;

            const data = {
                severity: statusCode >= 500 ? 'error' : 'warn',
                method: req.method,
                path: req.path,
                status: statusCode,
                errorName: error.name,
                errorMessage: truncate(error.message, 200),
                user: user?.email || user?.id?.toString() || 'anonymous',
                ip: req.ip || req.socket?.remoteAddress || undefined,
                userAgent: truncate(String(req.headers['user-agent'] || ''), 200) || undefined,
                referer: req.headers.referer || req.headers.referrer || undefined,
                host: req.hostname || req.headers.host || undefined,
                query: query ? truncate(query, 300) : undefined,
                body: bodyStr ? truncate(bodyStr, 500) : undefined,
                cause: describeCause(error.cause),
                stack: truncate(stack, 1500),
            };

            const headers: Record<string, string> = { 'Content-Type': 'application/json' };
            if (ctx.config.ntfy.token) {
                headers.Authorization = `Bearer ${ctx.config.ntfy.token}`;
            }

            const base = ctx.config.ntfy.url.replace(/\/$/, '');
            const endpoint = `${base}/${ctx.config.ntfy.topic}?template=bang&markdown=yes`;

            void fetch(endpoint, {
                method: 'POST',
                headers,
                body: JSON.stringify(data),
                signal: AbortSignal.timeout(5000),
            }).catch((err) => ctx.logger.error('ntfy notification failed', { error: err }));
        },
    };
}
