import type { Env } from './type.js';
import packageJson from '../package.json' with { type: 'json' };

export const config = {
    app: {
        port: parseInt(process.env.APP_PORT || '80', 10),
        env: (process.env.APP_ENV || process.env.NODE_ENV || 'development') as Env,
        version: packageJson.version,
        appUrl: process.env.APP_URL || 'localhost',
        adminEmail: process.env.APP_ADMIN_EMAIL || '',
        secretSalt: process.env.APP_SECRET_SALT || 'bang',
        slowRequestMs: parseInt(process.env.APP_SLOW_REQUEST_MS || '1000', 10),
    } as const,

    email: {
        host: process.env.EMAIL_HOST || 'smtp.gmail.com',
        port: parseInt(process.env.EMAIL_PORT || '587', 10),
        secure: process.env.EMAIL_SECURE === 'true', // true for 465, false for other ports
        user: process.env.EMAIL_USER || '',
        password: process.env.EMAIL_PASSWORD || '',
        from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@localhost',
    } as const,

    session: {
        secret: process.env.SESSION_SECRET || 'bang',
        domain: process.env.SESSION_DOMAIN || 'localhost',
    } as const,

    ntfy: {
        url: process.env.NTFY_URL || 'https://ntfy.jaw.dev',
        topic: process.env.NTFY_TOPIC || 'bang',
        token: process.env.NTFY_TOKEN || '',
    } as const,

    cloudflare: {
        turnstileSiteKey: process.env.CLOUDFLARE_TURNSTILE_SITE_KEY || 'sitekey',
        turnstileSecretKey: process.env.CLOUDFLARE_TURNSTILE_SECRET_KEY || 'secretkey',
    } as const,
} as const;
