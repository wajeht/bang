import path from 'path';
import dotenv from 'dotenv';
import { Env } from './types';

dotenv.config({ path: path.resolve(path.join(process.cwd(), '.env')) });

export const actionTypes = ['search', 'redirect'];

export const defaultSearchProviders = {
	duckduckgo: `https://duckduckgo.com/?q={query}`,
	google: `https://www.google.com/search?q={query}`,
	yahoo: `https://search.yahoo.com/search?p={query}`,
	bing: `https://www.bing.com/search?q={query}`,
};

export const appConfig = {
	port: parseInt(process.env.APP_PORT || '80', 10),
	env: (process.env.APP_ENV as Env) || 'development',
	appUrl: process.env.APP_URL || 'localhost',
	adminEmail: process.env.APP_ADMIN_EMAIL || '',
	secretSalt: process.env.APP_SECRET_SALT || 'bang',
} as const;

export const oauthConfig = {
	github: {
		redirect_uri: process.env.GITHUB_REDIRECT_URI || 'http://localhost/oauth/github/redirect',
		client_id: process.env.GITHUB_CLIENT_ID || '',
		client_secret: process.env.GITHUB_CLIENT_SECRET || '',
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
