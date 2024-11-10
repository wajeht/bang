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

export const databaseConfig = {
	port: parseInt(process.env.DB_PORT || '5432'),
	host: process.env.DB_HOST || 'postgres',
	username: process.env.DB_USERNAME || 'username',
	password: process.env.DB_PASSWORD || 'password',
	database: process.env.DB_DATABASE || 'database',
} as const;

export const redisConfig = {
	port: parseInt(process.env.REDIS_PORT || '6379'),
	host: process.env.REDIS_HOST || 'redis',
	password: process.env.REDIS_PASSWORD || '',
} as const;
