import {
	Api,
	ApiKeyPayload,
	BookmarkToExport,
	GitHubOauthToken,
	GithubUserEmail,
	User,
} from './types';
import qs from 'qs';
import fs from 'node:fs';
import axios from 'axios';
import fastq from 'fastq';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import { db } from './db/db';
import jwt from 'jsonwebtoken';
import { logger } from './logger';
import { Application, Request, Response, NextFunction } from 'express';
import { appConfig, defaultSearchProviders, notifyConfig, oauthConfig } from './configs';

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

export const insertBookmarkQueue = fastq.promise(insertBookmark, 10);

export async function insertBookmark({
	url,
	userId,
	title,
}: {
	url: string;
	userId: number;
	title?: string;
}) {
	return db('bookmarks').insert({
		user_id: userId,
		url: url,
		title: title || (await fetchPageTitle(url)),
		created_at: new Date(),
	});
}

export async function fetchPageTitle(url: string): Promise<string> {
	const client = url.startsWith('https') ? https : http;

	return new Promise<string>((resolve) => {
		const req = client.get(
			url,
			{
				timeout: 500,
				headers: { Accept: 'text/html' },
			},
			(res) => {
				if (res.statusCode !== 200) {
					req.destroy();
					return resolve('Untitled');
				}

				let isTitleFound = false;

				res.setEncoding('utf8');
				res.on('data', (chunk) => {
					if (!isTitleFound) {
						const match = /<title[^>]*>([^<]+)/i.exec(chunk);
						if (match && match[1]) {
							isTitleFound = true;
							resolve(match[1].slice(0, 100).trim());
							req.destroy();
						}
					}
				});

				res.on('end', () => {
					if (!isTitleFound) resolve('Untitled');
				});
			},
		);

		req.on('error', () => resolve('Untitled'));
		req.end();
	});
}

export function createBookmarkHTML(bookmark: BookmarkToExport): string {
	return `<DT><A HREF="${bookmark.url}" ADD_DATE="${bookmark.add_date}">${bookmark.title}</A>`;
}

export function createBookmarksDocument(bookmarks: BookmarkToExport[]) {
	const header = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>`;

	const footer = '</DL><p>';

	const bookmarksHTML = bookmarks.map((bookmark) => createBookmarkHTML(bookmark)).join('\n');

	return `${header}\n${bookmarksHTML}\n${footer}`;
}

export function reload({
	app,
	watch,
	options = {},
}: {
	app: Application;
	watch: { path: string; extensions: string[] }[];
	options?: { pollInterval?: number; quiet?: boolean };
}): void {
	if (appConfig.env !== 'development') return;

	const pollInterval = options.pollInterval || 50;
	const quiet = options.quiet || false;
	let changeDetected = false;
	const lastContents = new Map<string, string>();

	watch.forEach(({ path: dir, extensions }) => {
		const extensionsSet = new Set(extensions);
		fs.watch(dir, { recursive: true }, (_: fs.WatchEventType, filename: string | null) => {
			if (filename && extensionsSet.has(filename.slice(filename.lastIndexOf('.')))) {
				try {
					const fullPath = path.join(dir, filename);
					const content = fs.readFileSync(fullPath, 'utf8');

					if (content !== lastContents.get(fullPath)) {
						lastContents.set(fullPath, content);

						if (!quiet) logger.info('[reload] File changed: %s', filename);
						changeDetected = true;
					}
				} catch {
					if (!quiet) logger.debug('[reload] Error reading file: %s', filename);
				}
			}
		});
	});

	app.get('/wait-for-reload', (req: Request, res: Response) => {
		const timer = setInterval(() => {
			if (changeDetected) {
				changeDetected = false;
				clearInterval(timer);
				res.send();
			}
		}, pollInterval);

		req.on('close', () => clearInterval(timer));
	});

	const clientScript = `
	<script>
			(async function poll() {
					try {
							await fetch('/wait-for-reload');
							location.reload();
					} catch {
							location.reload();
					}
			})();
	</script>\n\t`;

	app.use((_req: Request, res: Response, next: NextFunction) => {
		const originalSend = res.send.bind(res);

		res.send = function (body: any): Response {
			if (typeof body === 'string' && body.includes('</head>')) {
				body = body.replace('</head>', clientScript + '</head>');
			}
			return originalSend(body);
		};

		next();
	});
}

export function isValidUrl(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch (_err) {
		return false;
	}
}

export async function search({
	res,
	user,
	query,
}: {
	res: Response;
	user: User | undefined;
	query: string;
}) {
	if (!user) {
		return res.redirect(
			defaultSearchProviders['duckduckgo'].replace('{query}', encodeURIComponent(query)),
		);
	}

	// Handle !bm command with URL
	if (query.startsWith('!bm')) {
		const urlToBookmark = query.slice(4).trim();

		if (!urlToBookmark || isValidUrl(urlToBookmark) === false) {
			return res.setHeader('Content-Type', 'text/html').send(`
        <script>
          alert("Invalid or missing URL");
          window.history.back();
        </script>`);
		}

		try {
			await insertBookmarkQueue.push({ url: urlToBookmark, userId: user.id });
			return res.redirect(urlToBookmark);
		} catch (error) {
			logger.error('Error adding bookmark:', error);
			return res.setHeader('Content-Type', 'text/html').send(`
        <script>
          alert("Error adding bookmark");
          window.location.href = "${urlToBookmark}";
        </script>`);
		}
	}

	// Handle !add command with URL
	if (query.startsWith('!add')) {
		const [_, trigger, url] = query.split(' ');

		if (!trigger?.startsWith('!') || !url?.length) {
			return res.setHeader('Content-Type', 'text/html').send(`
        <script>
          alert("Invalid trigger or empty URL");
          window.history.back();
        </script>`);
		}

		const existingBang = await db('bangs').where({ user_id: user.id, trigger }).first();

		if (existingBang || ['!add', '!bm'].includes(trigger)) {
			return res.setHeader('Content-Type', 'text/html').send(`
        <script>
          alert("Trigger ${trigger} already exists");
          window.history.back();
        </script>`);
		}

		await db('bangs').insert({
			user_id: user.id,
			trigger,
			name: await fetchPageTitle(url),
			action_type_id: 2, // redirect
			url,
		});

		return res
			.setHeader('Content-Type', 'text/html')
			.send(`<script> window.history.back(); </script>`);
	}

	// Handle other bang commands
	const bangMatch = query.match(/^!(\w+)(?:\s+(.*))?$/);
	if (bangMatch) {
		const [, bangTrigger, searchQuery = ''] = bangMatch;

		const customBang = await db('bangs')
			.join('action_types', 'bangs.action_type_id', 'action_types.id')
			.where({
				'bangs.trigger': `!${bangTrigger}`,
				'bangs.user_id': user.id,
			})
			.select('bangs.*', 'action_types.name as action_type')
			.first();

		if (customBang) {
			if (customBang.action_type === 'redirect') {
				return res.redirect(customBang.url);
			}

			if (customBang.action_type === 'search') {
				return res.redirect(customBang.url.replace('{query}', encodeURIComponent(searchQuery)));
			}
		}
	}

	const defaultProvider = user.default_search_provider || 'duckduckgo';
	const searchUrl = defaultSearchProviders[defaultProvider].replace(
		'{query}',
		encodeURIComponent(query),
	);

	return res.redirect(searchUrl);
}

export const sendNotificationQueue = fastq.promise(sendNotification, 10);

export async function sendNotification({
	req,
	error,
}: {
	req: Request;
	error: Error;
}): Promise<void> {
	try {
		const n = await fetch(notifyConfig.url, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'X-API-KEY': notifyConfig.apiKey,
			},
			body: JSON.stringify({
				message: `Error: ${error?.message}`,
				details: JSON.stringify(
					{
						request: {
							method: req.method,
							url: req.url,
							headers: req.headers,
							query: req.query,
							body: req.body,
						},
						error: {
							name: error?.name,
							message: error?.message,
							stack: error?.stack,
							cause: error?.cause,
						},
					},
					null,
					2,
				),
			}),
		});

		if (!n.ok) {
			const text = await n.text();
			logger.error(`Notification service responded with status ${n.status}: ${text}`);
		}
	} catch (error) {
		logger.error('Failed to send error notification', error);
	}
}

export const api: Api = {
	generate: async (payload: ApiKeyPayload): Promise<string> => {
		return jwt.sign(payload, appConfig.apiKeySecret);
	},
	verify: async (apiKey: string): Promise<ApiKeyPayload | null> => {
		try {
			const decodedApiKeyPayload = jwt.verify(apiKey, appConfig.apiKeySecret) as ApiKeyPayload;

			const app = await db('users')
				.where({
					id: decodedApiKeyPayload.userId,
					api_key: apiKey,
					api_key_version: decodedApiKeyPayload.apiKeyVersion,
				})
				.first();

			if (!app) return null;

			return decodedApiKeyPayload;
		} catch (error) {
			logger.error('failed to verify api key ', error);
			return null;
		}
	},
};

export function expectJson(req: Request): boolean {
	return req.get('Content-Type') === 'application/json';
}

export async function extractUser(req: Request): Promise<User> {
	if (expectJson(req) && req.apiKeyPayload) {
		return await db.select('*').from('users').where({ id: req.apiKeyPayload?.userId }).first();
	}

	return req.session.user!;
}

export function extractPagination(req: Request, user: User) {
	return {
		perPage: parseInt(req.query.per_page as string) || user.default_per_page,
		page: parseInt(req.query.page as string) || 1,
		search: ((req.query.search as string) || '').toLowerCase(),
		sortKey: req.query.sort_key as string,
		direction: req.query.direction as string,
	};
}
