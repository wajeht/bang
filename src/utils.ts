import {
	Api,
	User,
	Bang,
	ApiKeyPayload,
	GithubUserEmail,
	BookmarkToExport,
	GitHubOauthToken,
} from './types';
import qs from 'qs';
import fastq from 'fastq';
import { db } from './db/db';
import http from 'node:http';
import https from 'node:https';
import jwt from 'jsonwebtoken';
import { logger } from './logger';
import { bangs } from './db/bangs';
import { HttpError } from './errors';
import { bookmarks } from './repositories';
import { Request, Response } from 'express';
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
			logger.error('[getUserEmails]: Failed to fetch GitHub OAuth tokens');
			throw new HttpError(500, 'Failed to fetch GitHub OAuth tokens');
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
			logger.error('[getUserEmails]: Failed to fetch GitHub user emails');
			throw new HttpError(500, 'Failed to fetch GitHub user emails');
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
		throw new HttpError(500, 'You must pass in exactly one id: either bookmarkId or actionId');
	}

	const title = await fetchPageTitle(url);

	if (bookmarkId) {
		try {
			await db('bookmarks').where({ id: bookmarkId }).update({ title, updated_at: db.fn.now() });
		} catch (error) {
			logger.error(`[insertPageTitle]: error updating bookmark title, %o`, error);
		}
	}

	if (actionId) {
		try {
			await db('bangs').where({ id: actionId }).update({ name: title, updated_at: db.fn.now() });
		} catch (error) {
			logger.error(`[insertPageTitle]: error updating bangs name, %o`, error);
		}
	}
}

export async function fetchPageTitle(url: string): Promise<string> {
	try {
		new URL(url);
	} catch {
		return 'Untitled';
	}

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

export function isValidUrl(url: string): boolean {
	try {
		new URL(url);
		return true;
	} catch (error) {
		logger.error(`[isValidUrl]: Not a valid url, %o`, error);
		return false;
	}
}

const SEARCH_LIMIT = 60 as const;
const DELAY_INCREMENT = 5000 as const; // 5 seconds

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

// TODO: don't abstract this but please write tests
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
	// Parse search query into components:
	// - trigger: matches bang command at start (e.g., "!g" from "!g search term")
	// - url: matches URL in query (e.g., "https://example.com" from "!bm https://example.com")
	// - searchTerm: remaining query after removing trigger
	const triggerMatch = query.match(/^(!\w+)/);
	const urlMatch = query.match(/\s+(https?:\/\/\S+)/);
	const trigger = triggerMatch ? triggerMatch[1]! : null;
	const triggerWithoutBang = trigger ? trigger.slice(1) : null;
	const url = urlMatch ? urlMatch[1]! : null;
	const searchTerm = trigger ? query.slice(trigger.length).trim() : query.trim();

	// ==========================================
	// Unauthenticated User Flow
	// ==========================================
	if (!user) {
		// Initialize search count for rate limiting
		req.session.searchCount = req.session.searchCount || 0;
		const searchesLeft = SEARCH_LIMIT - req.session.searchCount;

		// Display warning message every 10 searches (except at 0)
		// Informs users about search limits and encourages login
		if (req.session.searchCount % 10 === 0 && req.session.searchCount !== 0) {
			const message =
				searchesLeft <= 0
					? "You've exceeded the search limit for unauthenticated users. Please log in for unlimited searches without delays."
					: `You have used ${req.session.searchCount} out of ${SEARCH_LIMIT} searches. Log in for unlimited searches!`;

			trackUnauthenticatedUserSearchHistoryQueue.push({ query, req });

			// Show warning and redirect to search results
			return res
				.setHeader('Content-Type', 'text/html')
				.status(200)
				.send(`
					<script>
						alert("${message}");
						window.location.href = "${defaultSearchProviders['duckduckgo'].replace('{{{s}}}', encodeURIComponent(searchTerm))}";
					</script>
				`); // prettier-ignore
		}

		// Apply rate limiting delay if user has exceeded limits
		if (req.session.cumulativeDelay) {
			logger.warn(`[search]: Slowing down session: ${req.session.id}, delay: ${req.session.cumulativeDelay / 1000}s due to exceeding search limit.`); // prettier-ignore
			await new Promise((resolve) => setTimeout(resolve, req.session.cumulativeDelay));
		}

		// Track search history for analytics
		trackUnauthenticatedUserSearchHistoryQueue.push({ query, req });

		// Handle bang commands for unauthenticated users
		if (triggerWithoutBang) {
			const bang = bangs[triggerWithoutBang] as Bang;
			// Found matching bang command in predefined list
			if (bang) {
				// Handle search with bang (e.g., "!g python")
				if (searchTerm) {
					// Apply rate limiting warning if needed
					if (req.session.cumulativeDelay) {
						return res
							.setHeader('Content-Type', 'text/html')
							.status(200)
							.send(`
								<script>
									alert("Your next search will be slowed down for ${req.session.cumulativeDelay / 1000} seconds.");
									window.location.href = "${bang.u.replace('{{{s}}}', encodeURIComponent(searchTerm))}";
								</script>
							`); // prettier-ignore
					}

					return res.redirect(bang.u.replace('{{{s}}}', encodeURIComponent(searchTerm)));
				}

				// Handle bang without search term (e.g., "!g")
				// This typically redirects to the service's homepage
				if (req.session.cumulativeDelay) {
					return res
						.setHeader('Content-Type', 'text/html')
						.status(200)
						.send(`
							<script>
								alert("Your next search will be slowed down for ${req.session.cumulativeDelay / 1000} seconds.");
								window.location.href = "${addHttps(bang.d)}";
							</script>
						`); // prettier-ignore
				}

				return res.redirect(addHttps(bang.d));
			}
		}

		// Handle default search for unauthenticated users (always uses DuckDuckGo)
		if (req.session.cumulativeDelay) {
			return res
				.setHeader('Content-Type', 'text/html')
				.status(200)
				.send(`
					<script>
						alert("Your next search will be slowed down for ${req.session.cumulativeDelay / 1000} seconds.");
						window.location.href = "${defaultSearchProviders['duckduckgo'].replace('{{{s}}}', encodeURIComponent(query))}";
					</script>
				`); // prettier-ignore
		}

		return res.redirect(defaultSearchProviders['duckduckgo'].replace('{{{s}}}', encodeURIComponent(query))); // prettier-ignore
	}

	// ==========================================
	// Authenticated User Flow
	// ==========================================

	// Handle direct navigation commands (e.g., @settings, @bookmarks)
	// These provide quick access to different sections of the application
	const directCommands: Record<string, string> = {
		'@a': '/actions',
		'@actions': '/actions',
		'@api': '/api-docs',
		'@b': '/',
		'@bang': '/',
		'@bm': '/bookmarks',
		'@bookmarks': '/bookmarks',
		'@data': '/settings/data',
		'@s': '/settings',
		'@settings': '/settings',
	};

	if (directCommands[query]) {
		return res.redirect(directCommands[query]);
	}

	// Handle bookmark creation command (!bm)
	// Allows users to quickly bookmark URLs while searching
	if (trigger === '!bm') {
		if (!url || !isValidUrl(url)) {
			return res
				.setHeader('Content-Type', 'text/html')
				.status(422)
				.send(`
					<script>
						alert("Invalid or missing URL");
						window.history.back();
					</script>
				`); // prettier-ignore
		}

		try {
			insertBookmarkQueue.push({ url, userId: user.id });
			return res.redirect(url);
		} catch (error) {
			logger.error(`[search]: Error adding bookmark %o`, error);
			return res
				.setHeader('Content-Type', 'text/html')
				.status(422)
				.send(`
					<script>
						alert("Error adding bookmark");
						window.location.href = "${url}";
					</script>
				`); // prettier-ignore
		}
	}

	// Handle custom bang creation command (!add)
	// Allows users to create their own bang shortcuts
	if (trigger === '!add') {
		const [, rawTrigger, url] = query.split(' ');
		// the second one
		// !add !yt https://youtube.com
		// !add yt https://youtube.com
		const trigger = rawTrigger?.startsWith('!') ? rawTrigger : `!${rawTrigger}`;
		if (!trigger || !url?.length) {
			return res
				.setHeader('Content-Type', 'text/html')
				.status(422)
				.send(`
					<script>
						alert("Invalid trigger or empty URL");
						window.history.back();
					</script>
				`); // prettier-ignore
		}

		// Check for existing bang with same trigger
		const existingBang = await db('bangs').where({ user_id: user.id, trigger }).first();

		if (existingBang || ['!add', '!bm'].includes(trigger)) {
			return res
				.setHeader('Content-Type', 'text/html')
				.status(422)
				.send(`
					<script>
						const newTrigger = prompt("Trigger ${trigger} already exists. Please enter a new trigger:");
						if (newTrigger) {
							const domain = window.location.origin;
							window.location.href = \`\${domain}/?q=!add \${newTrigger} ${url}\`;
						} else {
							window.history.back();
						}
					</script>
				`); // prettier-ignore
		}

		// Create new bang command in database
		const bangs = await db('bangs')
			.insert({
				user_id: user.id,
				trigger,
				name: 'Fetching title...',
				action_type_id: 2, // redirect
				url,
			})
			.returning('*');

		// Queue async task to fetch page title
		insertPageTitleQueue.push({ actionId: bangs[0].id, url });

		return res
			.setHeader('Content-Type', 'text/html')
			.status(200)
			.send(`<script> window.history.back(); </script>`);
	}

	// Handle user's custom bang commands
	if (trigger) {
		const customBang = await db('bangs')
			.join('action_types', 'bangs.action_type_id', 'action_types.id')
			.where({ 'bangs.trigger': trigger, 'bangs.user_id': user.id })
			.select('bangs.*', 'action_types.name as action_type')
			.first();

		if (customBang) {
			// Handle different types of custom bangs
			if (customBang.action_type === 'redirect') {
				return res.redirect(customBang.url);
			} else if (customBang.action_type === 'search') {
				return res.redirect(customBang.url.replace('{{{s}}}', encodeURIComponent(searchTerm)));
			}
		}
	}

	// Handle default bang commands from predefined list
	if (triggerWithoutBang) {
		const bang = bangs[triggerWithoutBang] as Bang;
		// Found matching bang in predefined list
		if (bang) {
			// Handle search with bang (e.g., "!g python")
			if (searchTerm) {
				return res.redirect(bang.u.replace('{{{s}}}', encodeURIComponent(searchTerm)));
			}

			// `!trigger` without search term
			// `!timer` which ddg has it
			//  bang: {
			//    c: 'Online Services',
			//    d: 'duckduckgo.com',
			//    r: 33,
			//    s: 'DuckDuckGo Timer',
			//    sc: 'Tools',
			//    t: 'timer',
			//    u: 'http://duckduckgo.com/?q=timer+{{{s}}}&ia=answer'
			// }
			if (bang.u.includes('{{{s}}}')) {
				return res.redirect(bang.u.replace('{{{s}}}', encodeURIComponent(searchTerm)));
			}

			// Handle bang without search term (redirects to service homepage)
			// in this case we will redirect `bang.d`
			//  bang: {
			//    c: 'Online Services',
			//    d: 'duckduckgo.com',
			//    r: 33,
			//    s: 'DuckDuckGo Timer',
			//    sc: 'Tools',
			//    t: 'timer',
			//    u: 'http://duckduckgo.com/?q=timer+{{{s}}}&ia=answer'
			// }
			return res.redirect(addHttps(bang.d));
		}
	}

	// Default search using user's preferred search engine
	const defaultProvider = user.default_search_provider || 'duckduckgo';
	// eg `!g cat videos`
	let searchUrl = defaultSearchProviders[defaultProvider].replace('{{{s}}}', encodeURIComponent(searchTerm)); // prettier-ignore

	// eg `!somethingthatdoesnotexist`
	// we will redirect to default search provider and it's keywords without `!`
	// eg `https://duckduckgo.com/?q=somethingthatdoesnotexist`
	if (!searchTerm) {
		searchUrl = defaultSearchProviders[defaultProvider].replace('{{{s}}}', encodeURIComponent(triggerWithoutBang ?? '')); // prettier-ignore
	}

	return res.redirect(searchUrl);
}

export function addHttps(url: string): string {
	url = url.trim();

	if (url.length === 0) {
		throw new Error('Invalid input: URL cannot be empty');
	}

	if (url.toLowerCase().startsWith('https://')) {
		return url;
	}

	if (url.toLowerCase().startsWith('http://')) {
		url = url.substring(7);
	}

	url = url.replace(/^\/+/, '');

	return `https://${url}`;
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
			logger.error(
				`[sendNotification]: Notification service responded with status ${n.status}: ${text}`,
			);
		}
	} catch (error) {
		logger.error(`[sendNotification]: failed to send error notification: %o`, error);
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
			logger.error(`[Api#verify]: failed to verify api key: %o`, error);
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

	throw new HttpError(500, 'User not found from request!');
}

export function extractPagination(req: Request) {
	return {
		perPage: parseInt(req.query.per_page as string, 10) || req.user!.default_per_page,
		page: parseInt(req.query.page as string, 10) || 1,
		search: ((req.query.search as string) || '').toLowerCase(),
		sortKey: (req.query.sort_key as string) || 'created_at',
		direction: (req.query.direction as string) || 'desc',
	};
}
