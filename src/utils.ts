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
import fastq from 'fastq';
import { db } from './db/db';
import path from 'node:path';
import http from 'node:http';
import https from 'node:https';
import jwt from 'jsonwebtoken';
import { logger } from './logger';
import { bookmarks } from './repositories';
import { Application, Request, Response, NextFunction } from 'express';
import { appConfig, defaultSearchProviders, notifyConfig, oauthConfig } from './configs';

export const sendNotificationQueue = fastq.promise(sendNotification, 10);
export const insertPageTitleQueue = fastq.promise(insertPageTitle, 10);
export const insertBookmarkQueue = fastq.promise(insertBookmark, 10);
export const trackUnauthenticatedUserSearchHistoryQueue = fastq.promise(
	trackUnauthenticatedUserSearchHistory,
	10,
);

export const github = {
	getOauthToken: async function (code: string): Promise<GitHubOauthToken> {
		const rootUrl = 'https://github.com/login/oauth/access_token';

		const options = {
			client_id: oauthConfig.github.client_id,
			client_secret: oauthConfig.github.client_secret,
			code,
		};

		const queryString = qs.stringify(options);

		const response = await fetch(`${rootUrl}?${queryString}`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
		});

		if (!response.ok) {
			logger.error('Failed to fetch GitHub OAuth tokens');
			throw new Error('Failed to fetch GitHub OAuth tokens');
		}

		const data = await response.text();
		return qs.parse(data) as GitHubOauthToken;
	},

	getUserEmails: async function (access_token: string): Promise<GithubUserEmail[]> {
		const response = await fetch('https://api.github.com/user/emails', {
			headers: {
				Authorization: `Bearer ${access_token}`,
			},
		});

		if (!response.ok) {
			logger.error('Failed to fetch GitHub user emails');
			throw new Error('Failed to fetch GitHub user emails');
		}

		return (await response.json()) as GithubUserEmail[];
	},
};

export async function insertBookmark({
	url,
	userId,
	title,
}: {
	url: string;
	userId: number;
	title?: string;
}) {
	const bookmark = await bookmarks.create({
		user_id: userId,
		url: url,
		title: title || 'Fetching title...',
	});

	if (!title) {
		insertPageTitleQueue.push({ bookmarkId: bookmark.id, url });
	}
}

export async function insertPageTitle({
	bookmarkId,
	actionId,
	url,
}: {
	bookmarkId?: number;
	actionId?: number;
	url: string;
}) {
	if ((bookmarkId && actionId) || (!bookmarkId && !actionId)) {
		throw new Error('You must pass in exactly one id: either bookmarkId or actionId');
	}

	let title = 'Untitled';

	try {
		title = await fetchPageTitle(url);
	} catch (error) {
		logger.error(`[insertPageTitle] error fetch page title,  %o`, error);
	}

	if (bookmarkId) {
		try {
			await db('bookmarks').where({ id: bookmarkId }).update({ title, updated_at: db.fn.now() });
		} catch (error) {
			logger.error(`[insertPageTitle] error updating bookmark title, %o`, error);
		}
	}

	if (actionId) {
		try {
			await db('bangs').where({ id: actionId }).update({ name: title, updated_at: db.fn.now() });
		} catch (error) {
			logger.error(`[insertPageTitle] error updating bangs name, %o`, error);
		}
	}
}

export async function fetchPageTitle(url: string): Promise<string> {
	const client = url.startsWith('https') ? https : http;

	return new Promise<string>((resolve) => {
		const req = client.get(
			url,
			{
				timeout: 5000, // 5 sec
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

export const bookmark = {
	_createHTML: function (bookmark: BookmarkToExport): string {
		return `<DT><A HREF="${bookmark.url}" ADD_DATE="${bookmark.add_date}">${bookmark.title}</A>`;
	},
	createDocument: function (bookmarks: BookmarkToExport[]): string {
		const header = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>`;

		const footer = '</DL><p>';

		const bookmarksHTML = bookmarks.map((bookmark) => this._createHTML(bookmark)).join('\n');

		return `${header}\n${bookmarksHTML}\n${footer}`;
	},
};

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
	} catch (error) {
		logger.error(`[isValidUrl] not a valid url, %o`, error);
		return false;
	}
}

const SEARCH_LIMIT = 5;
const DELAY_INCREMENT = 5000; // 5 seconds

export async function trackUnauthenticatedUserSearchHistory({
	req,
	query,
}: {
	req: Request;
	query: string;
}) {
	req.session.searchCount = req.session.searchCount || 0;
	req.session.cumulativeDelay = req.session.cumulativeDelay || 0;

	req.session.searchCount += 1;

	if (req.session.searchCount > SEARCH_LIMIT) {
		req.session.cumulativeDelay += DELAY_INCREMENT;
	}

	logger.info(`[trackUnauthenticatedUserSearchHistory]: %o`, {
		sessionId: req.session.id,
		query,
		searchCount: req.session.searchCount,
		cumulativeDelay: req.session.cumulativeDelay,
	});
}

export async function search({
	res,
	req,
	user,
	query,
}: {
	res: Response;
	req: Request;
	user?: User;
	query: string;
}) {
	if (!user) {
		if (req.session.cumulativeDelay) {
			logger.warn(
				`[search]: Slowing down session: ${req.session.id}, delay: ${req.session.cumulativeDelay}ms due to exceeding search limit.`,
			);
			await new Promise((resolve) => setTimeout(resolve, req.session.cumulativeDelay));
		}

		trackUnauthenticatedUserSearchHistoryQueue.push({ query, req });
		return res.redirect(
			defaultSearchProviders['duckduckgo'].replace('{query}', encodeURIComponent(query)),
		);
	}

	// Handle default commands
	const directCommands: Record<string, string> = {
		'@actions': '/actions',
		'@bookmarks': '/bookmarks',
		'@settings': '/settings',
	};

	if (directCommands[query]) {
		return res.redirect(directCommands[query]);
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
			insertBookmarkQueue.push({ url: urlToBookmark, userId: user.id });
			return res.redirect(urlToBookmark);
		} catch (error) {
			logger.error(`[search] Error adding bookmark %o`, error);
			return res.setHeader('Content-Type', 'text/html').send(`
        <script>
          alert("Error adding bookmark");
          window.location.href = "${urlToBookmark}";
        </script>`);
		}
	}

	// Handle !add command with URL
	if (query.startsWith('!add')) {
		const [, rawTrigger, url] = query.split(' ');
		const trigger = rawTrigger?.startsWith('!') ? rawTrigger : `!${rawTrigger}`;

		if (!trigger || !url?.length) {
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
          const newTrigger = prompt("Trigger ${trigger} already exists. Please enter a new trigger:");
          if (newTrigger) {
            const domain = window.location.origin;
            window.location.href = \`\${domain}/?q=!add \${newTrigger} ${url}\`;
          } else {
            window.history.back();
          }
        </script>`);
		}

		const bangs = await db('bangs')
			.insert({
				user_id: user.id,
				trigger,
				name: 'Fetching title...',
				action_type_id: 2, // redirect
				url,
			})
			.returning('*');

		insertPageTitleQueue.push({ actionId: bangs[0].id, url });

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
		logger.error(`failed to send error notification: %o`, error);
	}
}

export const api: Api = {
	generate: async function (payload: ApiKeyPayload): Promise<string> {
		return jwt.sign(payload, appConfig.apiKeySecret);
	},
	verify: async function (apiKey: string): Promise<ApiKeyPayload | null> {
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
			logger.error(`failed to verify api key: %o`, error);
			return null;
		}
	},
};

export function getApiKey(req: Request): string | undefined {
	const apiKey = req.header('X-API-KEY');
	const authHeader = req.header('Authorization');

	if (authHeader?.startsWith('Bearer ')) {
		return authHeader.substring(7);
	}

	return apiKey;
}

export function isApiRequest(req: Request): boolean {
	return !!getApiKey(req) || req.path.startsWith('/api') || expectJson(req);
}

export function expectJson(req: Request): boolean {
	return req.header('Content-Type') === 'application/json';
}

export async function extractUser(req: Request): Promise<User> {
	if (isApiRequest(req) && req.apiKeyPayload) {
		return db.select('*').from('users').where({ id: req.apiKeyPayload.userId }).first();
	}

	if (req.session?.user) {
		return req.session.user;
	}

	throw new Error('User not found from request!');
}

export function extractPagination(req: Request, user: User) {
	return {
		perPage: parseInt(req.query.per_page as string, 10) || user.default_per_page,
		page: parseInt(req.query.page as string, 1) || 1,
		search: ((req.query.search as string) || '').toLowerCase(),
		sortKey: req.query.sort_key as string,
		direction: (req.query.direction as string) === 'desc' ? 'desc' : 'asc',
	};
}
