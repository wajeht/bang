import dotenv from 'dotenv';
import path from 'node:path';
import { Env } from './type';

dotenv.config({ path: path.resolve(path.join(process.cwd(), '.env')) });

export const config = {
    app: {
        port: parseInt(process.env.APP_PORT || '80', 10),
        env: (process.env.APP_ENV as Env) || 'development',
        appUrl: process.env.APP_URL || 'localhost',
        adminEmail: process.env.APP_ADMIN_EMAIL || '',
        secretSalt: process.env.APP_SECRET_SALT || 'bang',
        apiKeySecret: process.env.APP_API_KEY_SECRET || 'bang',
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

    notify: {
        url: process.env.NOTIFY_URL || 'https://notify.jaw.dev/',
        apiKey: process.env.NOTIFY_X_API_KEY || '',
    } as const,
} as const;
