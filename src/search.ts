import fastq from 'fastq';
import { db } from './db/db';
import { logger } from './logger';
import { bangs } from './db/bangs';
import { User, Bang } from './types';
import { Request, Response } from 'express';
import { defaultSearchProviders } from './configs';
import { addHttps, insertBookmarkQueue, insertPageTitleQueue, isValidUrl } from './utils';

/**
 * Maximum number of searches allowed for unauthenticated users
 */
const SEARCH_LIMIT = 60 as const;

/**
 * Time penalty increment for exceeding search limit (in milliseconds)
 */
const DELAY_INCREMENT = 5000 as const;

/**
 * Direct commands that can be used to navigate to different sections of the application
 */
const DIRECT_COMMANDS: Record<string, string> = {
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

/**
 * Queue for tracking search history of unauthenticated users asynchronously
 */
export const trackUnauthenticatedUserSearchHistoryQueue = fastq.promise(trackUnauthenticatedUserSearchHistory, 10); // prettier-ignore

/**
 * Tracks search history for unauthenticated users and manages rate limiting
 * Increments search count and applies cumulative delay if limit is exceeded
 */
export async function trackUnauthenticatedUserSearchHistory({
	req,
	query,
}: {
	req: Request;
	query: string;
}) {
	// Initialize or get existing session counters
	req.session.searchCount = req.session.searchCount || 0;
	req.session.cumulativeDelay = req.session.cumulativeDelay || 0;

	req.session.searchCount += 1;

	// Apply delay penalty if search limit is exceeded
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

/**
 * Sends an HTML response that redirects the user with an optional alert message
 */
export function sendAlertAndRedirectResponse(res: Response, url: string, message?: string) {
	return res.setHeader('Content-Type', 'text/html')
		.status(200)
		.send(`
			<script>
				${message ? `alert("${message}");` : ''}
				window.location.href = "${url}";
			</script>
		`); // prettier-ignore
}

/**
 * Sends an HTML error response with an alert message and browser history navigation
 */
export function sendAlertAndBackResponse(res: Response, message: string) {
	return res
		.setHeader('Content-Type', 'text/html')
		.status(422)
		.send(`
			<script>
				alert("${message}");
				window.history.back();
			</script>
		`); // prettier-ignore
}

/**
 * Parses a search query to extract bang trigger, URL, and search terms
 *
 * @example
 * // Search with bang
 * parseSearchQuery("!g python")
 * // => { trigger: "!g", triggerWithoutBang: "g", url: null, searchTerm: "python" }
 *
 * // Bookmark with URL
 * parseSearchQuery("!bm title https://example.com")
 * // => { trigger: "!bm", triggerWithoutBang: "bm", url: "https://example.com", searchTerm: "title" }
 */
export function parseSearchQuery(query: string) {
	const triggerMatch = query.match(/^(!\w+)/);
	const urlMatch = query.match(/\s+(https?:\/\/\S+)/);
	const trigger = triggerMatch ? triggerMatch[1]! : null;
	const triggerWithoutBang = trigger ? trigger.slice(1) : null;
	const url = urlMatch ? urlMatch[1]! : null;
	const searchTerm = trigger ? query.slice(trigger.length).trim() : query.trim();

	return {
		/**
		 * !g
		 */
		trigger,
		/**
		 * g
		 */
		triggerWithoutBang,
		/**
		 * https://example.com
		 */
		url,
		/**
		 * python
		 */
		searchTerm,
	};
}

/**
 * Handles rate limiting for unauthenticated users
 */
export function handleRateLimiting(req: Request, searchCount: number) {
	const searchesLeft = SEARCH_LIMIT - searchCount;
	const showWarning = searchCount % 10 === 0 && searchCount !== 0;

	if (showWarning) {
		const message =
			searchesLeft <= 0
				? "You've exceeded the search limit for unauthenticated users. Please log in for unlimited searches without delays."
				: `You have used ${searchCount} out of ${SEARCH_LIMIT} searches. Log in for unlimited searches!`;
		return message;
	}

	return null;
}

/**
 * Processes bang redirect URLs
 *
 * @example
 * // With search term
 * handleBangRedirect({ u: "https://google.com/search?q={{{s}}}" }, "python")
 * // => "https://google.com/search?q=python"
 *
 * // Without search term (direct domain)
 * handleBangRedirect({ d: "google.com" }, "")
 * // => "https://google.com"
 */
export function handleBangRedirect(bang: Bang, searchTerm: string) {
	if (searchTerm) {
		return bang.u.replace('{{{s}}}', encodeURIComponent(searchTerm));
	}

	return addHttps(bang.d);
}

/**
 * Processes search queries and handles different user flows
 */
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
	const { trigger, triggerWithoutBang, url, searchTerm } = parseSearchQuery(query);

	// ============================================================================
	// Unauthenticated User Flow
	// ============================================================================
	if (!user) {
		// Initialize search count for new sessions
		req.session.searchCount = req.session.searchCount || 0;
		const warningMessage = handleRateLimiting(req, req.session.searchCount);

		// Display warning messages at search count thresholds
		if (warningMessage) {
			void trackUnauthenticatedUserSearchHistoryQueue.push({ query, req });
			return sendAlertAndRedirectResponse(res, defaultSearchProviders['duckduckgo'].replace('{{{s}}}', encodeURIComponent(searchTerm)), warningMessage); // prettier-ignore
		}

		// Enforce rate limiting delay for users who exceeded search limits
		if (req.session.cumulativeDelay) {
			logger.warn(`[search]: Slowing down session: ${req.session.id}, delay: ${req.session.cumulativeDelay / 1000}s due to exceeding search limit.`); // prettier-ignore
			await new Promise((resolve) => setTimeout(resolve, req.session.cumulativeDelay));
		}

		// Track search history asynchronously for analytics
		void trackUnauthenticatedUserSearchHistoryQueue.push({ query, req });

		// Process bang commands for unauthenticated users
		if (triggerWithoutBang) {
			const bang = bangs[triggerWithoutBang] as Bang;
			if (bang) {
				// Handle search query with bang (e.g., "!g python")
				if (searchTerm) {
					// Apply rate limiting warning if needed
					if (req.session.cumulativeDelay) {
						return sendAlertAndRedirectResponse(res, handleBangRedirect(bang, searchTerm), `Your next search will be slowed down for ${req.session.cumulativeDelay / 1000} seconds.`); // prettier-ignore
					}
					return res.redirect(handleBangRedirect(bang, searchTerm));
				}

				// Handle bang without search term (e.g., "!g") - redirects to service homepage
				if (req.session.cumulativeDelay) {
					return sendAlertAndRedirectResponse(res, handleBangRedirect(bang, ''), `Your next search will be slowed down for ${req.session.cumulativeDelay / 1000} seconds.`); // prettier-ignore
				}
				return res.redirect(handleBangRedirect(bang, ''));
			}
		}

		// Default search for unauthenticated users (always uses DuckDuckGo)
		if (req.session.cumulativeDelay) {
			return sendAlertAndRedirectResponse(res, defaultSearchProviders['duckduckgo'].replace('{{{s}}}', encodeURIComponent(query)), `Your next search will be slowed down for ${req.session.cumulativeDelay / 1000} seconds.`); // prettier-ignore
		}
		return res.redirect(defaultSearchProviders['duckduckgo'].replace('{{{s}}}', encodeURIComponent(query))); // prettier-ignore
	}

	// ============================================================================
	// Authenticated User Flow
	// ============================================================================

	// Handle direct navigation commands (e.g., @settings, @bookmarks)
	if (DIRECT_COMMANDS[query]) {
		return res.redirect(DIRECT_COMMANDS[query]);
	}

	// Handle bookmark creation command (!bm)
	if (trigger === '!bm') {
		if (!url || !isValidUrl(url)) {
			return sendAlertAndBackResponse(res, 'Invalid or missing URL');
		}

		try {
			// Extract title from command:
			// 1. !bm https://example.com            -> No title (auto-fetch)
			// 2. !bm title https://example.com     -> Single-word title
			// 3. !bm this is title https://ex.com  -> Multi-word title
			const urlIndex = query.indexOf(url!);
			const titleSection = query.slice(4, urlIndex).trim();

			void insertBookmarkQueue.push({ url, title: titleSection || '', userId: user.id });
			return res.redirect(url);
		} catch (error) {
			logger.error(`[search]: Error adding bookmark %o`, error);
			return sendAlertAndBackResponse(res, 'Error adding bookmark');
		}
	}

	// Handle custom bang creation command (!add)
	if (trigger === '!add') {
		const [, rawTrigger, url] = query.split(' ');
		// Ensure trigger starts with ! (e.g., convert 'yt' to '!yt')
		const trigger = rawTrigger?.startsWith('!') ? rawTrigger : `!${rawTrigger}`;

		if (!trigger || !url?.length) {
			return sendAlertAndBackResponse(res, 'Invalid trigger or empty URL');
		}

		// Validate trigger availability
		const hasSystemBangCommands = ['!add', '!bm'].includes(trigger);
		const hasExistingCustomBangCommand = await db('bangs')
			.where({ user_id: user.id, trigger })
			.first();

		// Handle trigger conflicts with prompt for new trigger
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

		// Create new bang command and queue title fetch
		const bangs = await db('bangs')
			.insert({
				user_id: user.id,
				trigger,
				name: 'Fetching title...',
				action_type_id: 2, // redirect
				url,
			})
			.returning('*');

		void insertPageTitleQueue.push({ actionId: bangs[0].id, url });

		return res
			.setHeader('Content-Type', 'text/html')
			.status(200)
			.send(`<script> window.history.back(); </script>`);
	}

	// Process user's custom bang commands
	if (trigger) {
		const customBang = await db('bangs')
			.join('action_types', 'bangs.action_type_id', 'action_types.id')
			.where({ 'bangs.trigger': trigger, 'bangs.user_id': user.id })
			.select('bangs.*', 'action_types.name as action_type')
			.first();

		if (customBang) {
			// Handle redirect-type custom bangs
			if (customBang.action_type === 'redirect') {
				return res.redirect(customBang.url);
			}

			// Handle search-type custom bangs
			if (customBang.action_type === 'search') {
				return res.redirect(customBang.url.replace('{{{s}}}', encodeURIComponent(searchTerm)));
			}
		}
	}

	// Process default bang commands from predefined list
	if (triggerWithoutBang) {
		const bang = bangs[triggerWithoutBang] as Bang;
		if (bang) {
			// Handle search with bang (e.g., "!g python")
			if (searchTerm) {
				return res.redirect(handleBangRedirect(bang, searchTerm));
			}

			// Handle special cases where bang URL includes {{{s}}} placeholder
			// Example: "!timer" -> redirects to DuckDuckGo timer
			if (bang.u.includes('{{{s}}}')) {
				return res.redirect(handleBangRedirect(bang, searchTerm));
			}

			// Handle bang without search term - redirect to service homepage
			return res.redirect(handleBangRedirect(bang, ''));
		}
	}

	// Default search using user's preferred search engine
	const defaultProvider = user.default_search_provider || 'duckduckgo';

	// Handle regular search or non-existent bang commands
	let searchUrl;
	if (!searchTerm) {
		// For non-existent bangs, search for the trigger itself
		searchUrl = defaultSearchProviders[defaultProvider].replace('{{{s}}}', encodeURIComponent(triggerWithoutBang ?? '')); // prettier-ignore
	} else {
		// Regular search with user's preferred provider
		searchUrl = defaultSearchProviders[defaultProvider].replace('{{{s}}}', encodeURIComponent(searchTerm)); // prettier-ignore
	}

	return res.redirect(searchUrl);
}
