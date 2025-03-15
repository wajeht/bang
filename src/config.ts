import dotenv from 'dotenv';
import path from 'node:path';
import { Env } from './type';

dotenv.config({ path: path.resolve(path.join(process.cwd(), '.env')) });

export const appConfig = {
    port: parseInt(process.env.APP_PORT || '80', 10),
    env: (process.env.APP_ENV as Env) || 'development',
    appUrl: process.env.APP_URL || 'localhost',
    adminEmail: process.env.APP_ADMIN_EMAIL || '',
    secretSalt: process.env.APP_SECRET_SALT || 'bang',
    apiKeySecret: process.env.APP_API_KEY_SECRET || 'bang',
} as const;

export const oauthConfig = {
    github: {
        redirect_uri: process.env.GITHUB_REDIRECT_URI || 'http://localhost/oauth/github/redirect',
        client_id: process.env.GITHUB_CLIENT_ID || '',
        client_secret: process.env.GITHUB_CLIENT_SECRET || '',
        root_url: 'https://github.com/login/oauth/authorize',
    },
} as const;

export const sessionConfig = {
    secret: process.env.SESSION_SECRET || 'bang',
    domain: process.env.SESSION_DOMAIN || 'localhost',
} as const;

export const notifyConfig = {
    url: process.env.NOTIFY_URL || 'https://notify.jaw.dev/',
    apiKey: process.env.NOTIFY_X_API_KEY || '',
} as const;
