import path from 'path';
import dotenv from 'dotenv';
import { Env } from './types';

dotenv.config({ path: path.resolve(path.join(process.cwd(), '.env')) });

export const appConfig = {
	port: parseInt(process.env.APP_PORT || '80', 10),
	env: (process.env.APP_ENV as Env) || 'development',
	appUrl: process.env.APP_URL || 'localhost',
	apiKeySecret: process.env.APP_API_KEY_SECRET || 'bang',
	secretSalt: process.env.APP_SECRET_SALT || 'bang',
} as const;
