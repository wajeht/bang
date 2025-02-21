import fastq from 'fastq';
import { db } from './db/db';
import { User, Bang } from './types';
import { Request, Response } from 'express';
import { bangs as bangsTable } from './db/bangs';
import { defaultSearchProviders } from './configs';
import { addHttps, insertBookmarkQueue, insertPageTitleQueue, isValidUrl } from './utils';

/**
 * Core configuration constants for the search functionality
 */
const searchConfig = {
	/**
	 * List of bangs that are available to use from the bangs table
	 */
	bangs: bangsTable,
	/**
	 * Maximum number of searches allowed for unauthenticated users
	 */
	searchLimit: 60,
	/**
	 * Time penalty increment for exceeding search limit (in milliseconds)
	 */
	delayIncrement: 5000,
	/**
	 * System-level bang commands that cannot be overridden by user-defined bangs
	 */
	systemBangs: ['!add', '!bm'],
	/**
	 * Direct commands that can be used to navigate to different sections of the application
	 */
	directCommands: {
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
	},
} as const;

/**
 * Queue for tracking search history of unauthenticated users asynchronously
 */
export const anonymousSearchHistoryQueue = fastq.promise(trackAnonymousUserSearch, 10);

/**
 * Tracks search history for unauthenticated users and manages rate limiting
 * Increments search count and applies cumulative delay if limit is exceeded
 */
export async function trackAnonymousUserSearch(req: Request) {
	// Initialize or get existing session counters
	req.session.searchCount = req.session.searchCount || 0;
	req.session.cumulativeDelay = req.session.cumulativeDelay || 0;

	req.session.searchCount += 1;

	// Apply delay penalty if search limit is exceeded
	if (req.session.searchCount > searchConfig.searchLimit) {
		req.session.cumulativeDelay += searchConfig.delayIncrement;
	}
}

/**
 * Sends an HTML response that redirects the user with an optional alert message
 */
export function redirectWithAlert(res: Response, url: string, message?: string) {
	return res.setHeader('Content-Type', 'text/html').status(200).send(`
			<script>
				${message ? `alert("${message}");` : ''}
				window.location.href = "${url}";
			</script>
		`);
}

/**
 * Sends an HTML error response with an alert message and browser history navigation
 */
export function goBackWithAlert(res: Response, message: string) {
	return res.setHeader('Content-Type', 'text/html').status(422).send(`
			<script>
				alert("${message}");
				window.history.back();
			</script>
		`);
}

/**
 * Parses a search query to extract components: bang trigger, URL, and search terms
 *
 * @param query - The raw search query string to parse
 * @returns Parsed components of the search query
 *
 * @example Basic search
 * parseSearchQuery("!g python")
 * → { trigger: "!g", triggerWithoutBang: "g", url: null, searchTerm: "python" }
 *
 * @example Bookmark with title
 * parseSearchQuery("!bm My Bookmark https://example.com")
 * → { trigger: "!bm", triggerWithoutBang: "bm", url: "https://example.com", searchTerm: "My Bookmark" }
 *
 * @example Custom bang creation
 * parseSearchQuery("!add !custom https://custom-search.com")
 * → { trigger: "!add", triggerWithoutBang: "add", url: "https://custom-search.com", searchTerm: "!custom" }
 */
export function parseSearchQuery(query: string) {
	// Sanitize input
	const sanitizedQuery = query.trim().replace(/\s+/g, ' ');

	// Enhanced regex patterns
	const triggerPattern = /^(![\w-]+)/; // Supports hyphens in triggers
	const urlPattern = /\s+((?:https?:\/\/)[^\s]+)/i; // Case-insensitive, more permissive URL matching

	// Extract components
	const triggerMatch = sanitizedQuery.match(triggerPattern);
	const urlMatch = sanitizedQuery.match(urlPattern);

	const trigger = triggerMatch?.[1] ?? null;
	const triggerWithoutExclamationMark = trigger?.slice(1) ?? null;
	const url = urlMatch?.[1] ?? null;

	// Process search term with URL removal
	let searchTerm = trigger ? sanitizedQuery.slice(trigger.length) : sanitizedQuery;

	if (url) {
		searchTerm = searchTerm.replace(url, '');
	}

	// Clean up search term
	searchTerm = searchTerm.trim().replace(/\s+/g, ' ');

	return {
		/**
		 * The full bang trigger including "!" prefix
		 * Used for command identification and routing
		 * @example "!g" for Google search
		 * @example "!bm" for bookmark command
		 * @example "!add" for adding custom bangs
		 */
		trigger,

		/**
		 * Bang trigger with "!" prefix removed
		 * Used for looking up commands in bangs table
		 * @example "g" for Google search
		 * @example "bm" for bookmark command
		 */
		triggerWithoutExclamationMark,

		/**
		 * First valid URL found in the query string
		 * Used for bookmark creation and custom bang definition
		 * Supports both http and https protocols
		 * @example "https://example.com" from "!bm title https://example.com"
		 * @example null when no URL is present
		 */
		url,

		/**
		 * The search terms or content after removing trigger and URL
		 * Multiple uses based on context:
		 * - Search query for search bangs
		 * - Title for bookmarks
		 * - Trigger for custom bang creation
		 * @example "python" from "!g python"
		 * @example "My Bookmark" from "!bm My Bookmark https://example.com"
		 */
		searchTerm,
	};
}

/**
 * Handles rate limiting for unauthenticated users
 * Returns warning message when search count reaches multiples of 10
 */
export function getSearchLimitWarning(req: Request, searchCount: number) {
	const searchesLeft = searchConfig.searchLimit - searchCount;
	const showWarning = searchCount % 10 === 0 && searchCount !== 0;

	if (showWarning) {
		const message =
			searchesLeft <= 0
				? "You've exceeded the search limit for unauthenticated users. Please log in for unlimited searches without delays."
				: `You have used ${searchCount} out of ${searchConfig.searchLimit} searches. Log in for unlimited searches!`;
		return message;
	}

	return null;
}

/**
 * Processes bang redirect URLs Handles both search queries and direct domain redirects
 */
export function getBangRedirectUrl(bang: Bang, searchTerm: string) {
	if (searchTerm) {
		return bang.u.replace('{{{s}}}', encodeURIComponent(searchTerm));
	}

	return addHttps(bang.d);
}

/**
 * Handles the flow for unauthenticated users
 * Displays warning when user approaches or exceeds search limits
 * Enforces rate limiting delay for users who exceeded search limits
 * Asynchronously tracks search for analytics purposes
 * Processes bang commands for unauthenticated users
 */
export async function handleAnonymousSearch(
	req: Request,
	res: Response,
	query: string,
	triggerWithoutBang: string,
	searchTerm: string,
) {
	const warningMessage = getSearchLimitWarning(req, req.session.searchCount ?? 0);

	// Display warning when user approaches or exceeds search limits
	if (warningMessage) {
		void anonymousSearchHistoryQueue.push(req);
		return redirectWithAlert(
			res,
			defaultSearchProviders['duckduckgo'].replace('{{{s}}}', encodeURIComponent(searchTerm)),
			warningMessage,
		);
	}

	// Enforce rate limiting delay for users who exceeded search limits
	if (req.session.cumulativeDelay) {
		await new Promise((resolve) => setTimeout(resolve, req.session.cumulativeDelay));
	}

	// Asynchronously track search for analytics purposes
	void anonymousSearchHistoryQueue.push(req);

	// Process bang commands for unauthenticated users
	if (triggerWithoutBang) {
		const bang = searchConfig.bangs[triggerWithoutBang] as Bang;
		if (bang) {
			// Handle search queries with bang (e.g., "!g python")
			if (searchTerm) {
				// Show warning if rate limiting is active
				if (req.session.cumulativeDelay) {
					return redirectWithAlert(
						res,
						`Your next search will be slowed down for ${req.session.cumulativeDelay / 1000} seconds.`,
					);
				}

				return res.redirect(getBangRedirectUrl(bang, searchTerm));
			}

			// Handle bang-only queries (e.g., "!g") - redirects to service homepage
			if (req.session.cumulativeDelay) {
				return redirectWithAlert(
					res,
					getBangRedirectUrl(bang, ''),
					`Your next search will be slowed down for ${req.session.cumulativeDelay / 1000} seconds.`,
				);
			}

			return res.redirect(getBangRedirectUrl(bang, ''));
		}
	}

	// Process regular search using DuckDuckGo (default for unauthenticated users)
	if (req.session.cumulativeDelay) {
		return redirectWithAlert(
			res,
			defaultSearchProviders['duckduckgo'].replace('{{{s}}}', encodeURIComponent(query)),
			`Your next search will be slowed down for ${req.session.cumulativeDelay / 1000} seconds.`,
		);
	}

	return res.redirect(defaultSearchProviders['duckduckgo'].replace('{{{s}}}', encodeURIComponent(query))); // prettier-ignore
}

/**
 *
 * TODO: clean this function and write tests for all edge cases
 *
 * Processes search queries and handles different user flows
 * - Unauthenticated user flow: Handles rate limiting, bang commands, and default search
 * - Authenticated user flow: Handles direct navigation commands, bookmark creation, and custom bang commands
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
	const { trigger, triggerWithoutExclamationMark, url, searchTerm } = parseSearchQuery(query);

	if (!user) {
		return await handleAnonymousSearch(
			req,
			res,
			query,
			triggerWithoutExclamationMark ?? '',
			searchTerm ?? '',
		);
	}

	// Handle application navigation shortcuts (e.g., "@settings", "@bookmarks")
	const directCommand =
		searchConfig.directCommands[query as keyof typeof searchConfig.directCommands];
	if (directCommand) {
		return res.redirect(directCommand);
	}

	// Process bookmark creation command (!bm)
	// Formats supported:
	// 1. !bm https://example.com
	// 2. !bm title https://example.com
	// 3. !bm this is a long title https://example.com
	if (trigger === '!bm') {
		if (!url || !isValidUrl(url)) {
			return goBackWithAlert(res, 'Invalid or missing URL');
		}

		try {
			// Extract title from command by removing "!bm" and URL
			const urlIndex = query.indexOf(url!);
			const titleSection = query.slice(4, urlIndex).trim();

			void insertBookmarkQueue.push({ url, title: titleSection || '', userId: user.id });

			return res.redirect(url);
		} catch (error) {
			return redirectWithAlert(res, 'Error adding bookmark');
		}
	}

	// Process custom bang creation command (!add)
	// Format: !add !trigger URL or !add trigger URL
	if (trigger === '!add') {
		const [, rawTrigger, url] = query.split(' ');
		const trigger = rawTrigger?.startsWith('!') ? rawTrigger : `!${rawTrigger}`;

		// Validate command format
		if (!trigger || !url?.length) {
			return goBackWithAlert(res, 'Invalid trigger or empty URL');
		}

		// Prevent duplicates and system command conflicts
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

	// Process user-defined custom bang commands
	if (trigger) {
		const customBang = await db('bangs')
			.join('action_types', 'bangs.action_type_id', 'action_types.id')
			.where({ 'bangs.trigger': trigger, 'bangs.user_id': user.id })
			.select('bangs.*', 'action_types.name as action_type')
			.first();

		if (customBang) {
			// Handle redirect-type bangs (direct URL navigation)
			if (customBang.action_type === 'redirect') {
				return res.redirect(customBang.url);
			}

			// Handle search-type bangs (URL with search parameter)
			if (customBang.action_type === 'search') {
				return res.redirect(customBang.url.replace('{{{s}}}', encodeURIComponent(searchTerm)));
			}
		}
	}

	// Process system-defined bang commands
	if (triggerWithoutExclamationMark) {
		const bang = searchConfig.bangs[triggerWithoutExclamationMark] as Bang;
		if (bang) {
			// Handle search queries with bang (e.g., "!g python")
			if (searchTerm) {
				return res.redirect(getBangRedirectUrl(bang, searchTerm));
			}

			// Handle special cases where bang URL requires search parameter
			// Example: DuckDuckGo timer (!timer)
			if (bang.u.includes('{{{s}}}')) {
				return res.redirect(getBangRedirectUrl(bang, searchTerm));
			}

			// Handle bang-only queries - redirect to service homepage
			return res.redirect(getBangRedirectUrl(bang, ''));
		}
	}

	// Process default search using user's preferred search engine
	const defaultProvider = user.default_search_provider || 'duckduckgo';

	// Handle regular search queries or fallback for unknown bangs
	let searchUrl = defaultSearchProviders[defaultProvider].replace('{{{s}}}', encodeURIComponent(searchTerm)); // prettier-ignore

	// Handle unknown bang commands by searching for them without the "!"
	if (!searchTerm) {
		searchUrl = defaultSearchProviders[defaultProvider].replace('{{{s}}}', encodeURIComponent(triggerWithoutExclamationMark ?? '')); // prettier-ignore
	}

	return res.redirect(searchUrl);
}
