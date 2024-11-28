import qs from 'qs';
import fs from 'fs';
import axios from 'axios';
import path from 'node:path';
import { db } from './db/db';
import { logger } from './logger';
import { appConfig, oauthConfig } from './configs';
import { BookmarkToExport, GitHubOauthToken, GithubUserEmail, User } from './types';
import { Application, Request, Response, NextFunction } from 'express';

export const defaultSearchProviders = {
	duckduckgo: `https://duckduckgo.com/?q={query}`,
	google: `https://www.google.com/search?q={query}`,
	yahoo: `https://search.yahoo.com/search?p={query}`,
	bing: `https://www.bing.com/search?q={query}`,
};

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

	app.use((req: Request, res: Response, next: NextFunction) => {
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

export async function search({ res, user, query }: { res: Response; user: User; query: string }) {
	// Handle !add command with URL
	if (query.startsWith('!add')) {
		const urlToBookmark = query.slice(5).trim();

		if (urlToBookmark) {
			try {
				await db('bookmarks').insert({
					user_id: user.id,
					url: urlToBookmark,
					title: await fetchPageTitle(urlToBookmark),
					created_at: new Date(),
				});

				return res.redirect(urlToBookmark);
			} catch (error) {
				logger.error('Error adding bookmark:', error);
				res.setHeader('Content-Type', 'text/html').send(`
						<script>
							alert("Error adding bookmark");
							window.location.href = "${urlToBookmark}";
						</script>`);
				return;
			}
		}

		// If no URL provided in !add command, go back
		res.setHeader('Content-Type', 'text/html').send(`
				<script>
					alert("No URL provided for bookmark");
					window.history.back();
				</script>`);
		return;
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
			if (customBang.action_type_id === 2) {
				return res.redirect(customBang.url);
			}

			if (customBang.action_type_id === 1) {
				const searchUrl = customBang.url.replace('{query}', encodeURIComponent(searchQuery));
				return res.redirect(searchUrl);
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
