import path from 'node:path';
import axios from 'axios';
import { logger } from './logger';
import { db } from './db/db';
import { appConfig, oauthConfig } from './configs';
import { GitHubOauthToken, GithubUserEmail } from './types';
import qs from 'qs';

export async function runMigrations(force: boolean = false) {
	try {
		if (appConfig.env !== 'production' && force !== true) {
			logger.info('cannot run auto database migration on non production');
			return;
		}

		const config = {
			directory: path.resolve(path.join(process.cwd(), 'dist', 'src', 'db', 'migrations')),
		};

		if (appConfig.env !== 'production') {
			config.directory = path.resolve(path.join(process.cwd(), 'src', 'db', 'migrations'));
		}

		const version = await db.migrate.currentVersion();

		logger.info(`current database version ${version}`);

		logger.info(`checking for database upgrades`);

		const [batchNo, migrations] = await db.migrate.latest(config);

		if (migrations.length === 0) {
			logger.info('database upgrade not required');
			return;
		}

		const migrationList = migrations
			.map((migration: any) => migration.split('_')[1].split('.')[0])
			.join(', ');

		logger.info(`database upgrades completed for ${migrationList} schema`);

		logger.info(`batch ${batchNo} run: ${migrations.length} migrations`);
	} catch (error) {
		logger.error('error running migrations', error);
		throw error;
	}
}
export async function getGithubOauthToken(code: string): Promise<GitHubOauthToken> {
	const rootUrl = 'https://github.com/login/oauth/access_token';

	const options = {
		client_id: oauthConfig.github.client_id,
		client_secret: oauthConfig.github.client_secret,
		code,
	};

	const queryString = qs.stringify(options);

	try {
		const { data } = await axios.post(`${rootUrl}?${queryString}`, {
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
		});

		const decoded = qs.parse(data) as GitHubOauthToken;

		return decoded;
	} catch (error: any) {
		logger.error('failed to fetch github oauth tokens', error);
		throw error;
	}
}

export async function getGithubUserEmails(access_token: string): Promise<GithubUserEmail[]> {
	try {
		const { data } = await axios.get<GithubUserEmail[]>('https://api.github.com/user/emails', {
			headers: {
				Authorization: `Bearer ${access_token}`,
			},
		});

		return data;
	} catch (error: any) {
		logger.error('failed to fetch github user emails', error);
		throw error;
	}
}

export async function fetchPageTitle(url: string): Promise<string> {
	try {
		const response = await axios.get(url, {
			timeout: 5000,
			headers: {
				'User-Agent':
					'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
			},
		});
		const match = response.data.match(/<title[^>]*>([^<]+)<\/title>/);
		return match ? match[1].replace(/\s+/g, ' ').trim().slice(0, 100) : 'Untitled';
	} catch (error) {
		return 'Untitled';
	}
}
