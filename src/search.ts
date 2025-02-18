import fastq from 'fastq';
import { db } from './db/db';
import { logger } from './logger';
import { bangs } from './db/bangs';
import { User, Bang } from './types';
import { Request, Response } from 'express';
import { defaultSearchProviders } from './configs';
import { addHttps, insertBookmarkQueue, insertPageTitleQueue, isValidUrl } from './utils';

const SEARCH_LIMIT = 60 as const;
const DELAY_INCREMENT = 5000 as const; // 5 seconds

export const trackUnauthenticatedUserSearchHistoryQueue = fastq.promise(trackUnauthenticatedUserSearchHistory, 10); // prettier-ignore

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

			void trackUnauthenticatedUserSearchHistoryQueue.push({ query, req });

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
		void trackUnauthenticatedUserSearchHistoryQueue.push({ query, req });

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
			// The bookmark command (!bm) supports three formats:
			// 1. !bm https://example.com - Creates bookmark with no title (will fetch title automatically)
			// 2. !bm title https://example.com - Creates bookmark with a single-word title
			// 3. !bm this is a long title https://example.com - Creates bookmark with a multi-word title

			// Find the URL in the command string
			const urlIndex = query.indexOf(url!);
			// Extract everything between "!bm " and the URL as the title
			const titleSection = query.slice(4, urlIndex).trim();

			void insertBookmarkQueue.push({ url, title: titleSection || '', userId: user.id });

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
		const hasSystemBangCommands = ['!add', '!bm'].includes(trigger);
		const hasExistingCustomBangCommand = await db('bangs')
			.where({ user_id: user.id, trigger })
			.first();

		if (hasExistingCustomBangCommand || hasSystemBangCommands) {
			let message = 'Trigger ${trigger} already exists. Please enter a new trigger:';

			if (hasSystemBangCommands) {
				message = `${trigger} is a bang's systems command. Please enter a new trigger:`;
			}

			return res
        .setHeader('Content-Type', 'text/html')
        .status(422)
        .send(`
          <script>
            const newTrigger = prompt("${message}");
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
		void insertPageTitleQueue.push({ actionId: bangs[0].id, url });

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

		// Handle different types of custom bangs
		if (customBang) {
			if (customBang.action_type === 'redirect') {
				return res.redirect(customBang.url);
			}

			if (customBang.action_type === 'search') {
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
