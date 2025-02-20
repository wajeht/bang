import fastq from 'fastq';
import { db } from './db/db';
import { logger } from './logger';
import { bangs as bangsTable } from './db/bangs';
import { User, Bang } from './types';
import { Request, Response } from 'express';
import { defaultSearchProviders } from './configs';
import { addHttps, insertBookmarkQueue, insertPageTitleQueue, isValidUrl } from './utils';

/**
 * Core configuration constants for the search functionality
 */
const config = {
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
	directBangs: {
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
 * Uses fastq to handle concurrent requests with a concurrency limit of 10
 */
export const trackUnauthenticatedUserSearchHistoryQueue = fastq.promise(
	trackUnauthenticatedUserSearchHistory,
	10,
);

/**
 * Sends an HTML response that redirects the user with an alert message
 */
function sendAlertAndRedirectResponse(res: Response, url: string, message: string) {
	return res.setHeader('Content-Type', 'text/html').status(200).send(`
			<script>
				alert("${message}");
				window.location.href = "${url}";
			</script>
		`);
}

/**
 * Sends an HTML error response with an alert message and browser history navigation
 * Used for error cases where we want to go back to the previous page
 */
function sendAlertAndBackResponse(res: Response, message: string) {
	return res.setHeader('Content-Type', 'text/html').status(422).send(`
			<script>
				alert("${message}");
				window.history.back();
			</script>
		`);
}

/**
 * Tracks search history for unauthenticated users and manages rate limiting
 * Increments search count and applies cumulative delay if limit is exceeded
 */
async function trackUnauthenticatedUserSearchHistory({
	req,
	query,
}: {
	req: Request;
	query: string;
}) {
	req.session.searchCount = (req.session.searchCount || 0) + 1;

	if (req.session.searchCount > config.searchLimit) {
		req.session.cumulativeDelay = (req.session.cumulativeDelay || 0) + config.delayIncrement;
	}

	logger.info('[trackUnauthenticatedUserSearchHistory]:', {
		sessionId: req.session.id,
		query,
		searchCount: req.session.searchCount,
		cumulativeDelay: req.session.cumulativeDelay,
	});
}

/**
 * Handles rate limiting logic and returns appropriate warning messages
 * Shows warnings at every 10th search and when limit is exceeded
 */
function handleRateLimiting(searchCount: number): string | null {
	const searchesLeft = config.searchLimit - searchCount;
	const showWarning = searchCount % 10 === 0 && searchCount !== 0;

	if (!showWarning) {
		return null;
	}

	if (searchesLeft <= 0) {
		return "You've exceeded the search limit for unauthenticated users. Please log in for unlimited searches without delays.";
	}

	return `You have used ${searchCount} out of ${config.searchLimit} searches. Log in for unlimited searches!`;
}

/**
 * Parses search query into its components:
 * - trigger: The bang command (e.g., "!g")
 * - triggerWithoutBang: The bang command without the ! prefix
 * - url: Any URL in the query
 * - searchTerm: The actual search terms
 */
function parseSearchQuery(query: string) {
	const triggerMatch = query.match(/^(!\w+)/);
	const urlMatch = query.match(/\s+(https?:\/\/\S+)/);
	const trigger = triggerMatch?.[1] || null;
	const triggerWithoutExclamationMark = trigger?.slice(1) || null;
	const url = urlMatch?.[1] || null;
	const searchTerm = trigger ? query.slice(trigger.length).trim() : query.trim();

	return { trigger, triggerWithoutExclamationMark, url, searchTerm };
}

/**
 * Processes bang redirect URLs
 * Handles both search queries and direct homepage redirects
 */
function handleBangRedirect(bang: Bang, searchTerm: string) {
	if (searchTerm) {
		return bang.u.replace('{{{s}}}', encodeURIComponent(searchTerm));
	}

	return addHttps(bang.d);
}

/**
 * Handles system-level bang commands (!bm and !add)
 * - !bm: Creates a new bookmark
 * - !add: Creates a new custom bang command
 */
async function handleSystemCommands({
	res,
	user,
	trigger,
	url,
	query,
}: {
	res: Response;
	user: User;
	trigger: string;
	url: string | null;
	query: string;
}) {
	// Handle bookmark creation (!bm)
	if (trigger === '!bm') {
		if (!url || !isValidUrl(url)) {
			return sendAlertAndBackResponse(res, 'Invalid or missing URL');
		}

		try {
			const urlIndex = query.indexOf(url);
			const titleSection = query.slice(4, urlIndex).trim();
			void insertBookmarkQueue.push({ url, title: titleSection || '', userId: user.id });
			return res.redirect(url);
		} catch (error) {
			logger.error('[search]: Error adding bookmark', error);
			return sendAlertAndBackResponse(res, 'Error adding bookmark');
		}
	}

	// Handle custom bang creation (!add)
	if (trigger === '!add') {
		const [, rawTrigger, bangUrl] = query.split(' ');
		const newTrigger = rawTrigger?.startsWith('!') ? rawTrigger : `!${rawTrigger}`;

		if (!newTrigger || !bangUrl?.length) {
			return sendAlertAndBackResponse(res, 'Invalid trigger or empty URL');
		}

		// Check for conflicts with existing bangs
		const hasSystemBangCommands = config.systemBangs.includes(
			newTrigger as (typeof config.systemBangs)[number],
		);
		const hasExistingCustomBangCommand = await db('bangs')
			.where({ user_id: user.id, trigger: newTrigger })
			.first();

		if (hasExistingCustomBangCommand || hasSystemBangCommands) {
			const message = hasSystemBangCommands
				? `${newTrigger} is a bang's systems command. Please enter a new trigger:`
				: `Trigger ${newTrigger} already exists. Please enter a new trigger:`;

			return res.setHeader('Content-Type', 'text/html').status(422).send(`
					<script>
						const newTrigger = prompt("${message}");
						if (newTrigger) {
							const domain = window.location.origin;
							window.location.href = \`\${domain}/?q=!add \${newTrigger} ${bangUrl}\`;
						} else {
							window.history.back();
						}
					</script>
				`);
		}

		// Create new bang command and queue title fetch
		const bangs = await db('bangs')
			.insert({
				user_id: user.id,
				trigger: newTrigger,
				name: 'Fetching title...',
				action_type_id: 2,
				url: bangUrl,
			})
			.returning('*');

		void insertPageTitleQueue.push({ actionId: bangs[0].id, url: bangUrl });
		return res
			.setHeader('Content-Type', 'text/html')
			.status(200)
			.send(`<script>window.history.back();</script>`);
	}

	return null;
}

/**
 * Handles search flow for unauthenticated users
 * Includes rate limiting, delay penalties, and warning messages
 */
async function handleUnauthenticatedSearch({
	res,
	req,
	trigger,
	triggerWithoutExclamationMark,
	searchTerm,
	query,
}: {
	res: Response;
	req: Request;
	trigger: string | null;
	triggerWithoutExclamationMark: string | null;
	searchTerm: string;
	query: string;
}) {
	// Initialize session counters
	req.session.searchCount = req.session.searchCount || 0;
	const warningMessage = handleRateLimiting(req.session.searchCount);

	// Track search history asynchronously
	void trackUnauthenticatedUserSearchHistoryQueue.push({ query, req });

	// Apply delay penalty if search limit is exceeded
	if (req.session.cumulativeDelay) {
		await new Promise((resolve) => setTimeout(resolve, req.session.cumulativeDelay));
	}

	// Process bang commands for unauthenticated users
	if (triggerWithoutExclamationMark) {
		const bang = config.bangs[triggerWithoutExclamationMark] as Bang;
		if (bang) {
			const redirectUrl = handleBangRedirect(bang, searchTerm);
			if (req.session.cumulativeDelay) {
				return sendAlertAndRedirectResponse(
					res,
					redirectUrl,
					`Your next search will be slowed down for ${req.session.cumulativeDelay / 1000} seconds.`,
				);
			}
			return res.redirect(redirectUrl);
		}
	}

	// Default search using DuckDuckGo
	const searchUrl = defaultSearchProviders['duckduckgo'].replace(
		'{{{s}}}',
		encodeURIComponent(query),
	);

	if (warningMessage) {
		return sendAlertAndRedirectResponse(res, searchUrl, warningMessage);
	}

	if (req.session.cumulativeDelay) {
		return sendAlertAndRedirectResponse(
			res,
			searchUrl,
			`Your next search will be delayed by ${req.session.cumulativeDelay / 1000} seconds.`,
		);
	}

	return res.redirect(searchUrl);
}

/**
 * Main search handler
 * Processes search queries and redirects based on various commands and user state
 *
 * Flow:
 * 1. Parse search query
 * 2. Handle unauthenticated users
 * 3. Process direct commands
 * 4. Handle system commands
 * 5. Process custom bangs
 * 6. Handle default bangs
 * 7. Fall back to default search provider
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

	// Handle unauthenticated users first
	if (!user) {
		return await handleUnauthenticatedSearch({
			res,
			req,
			trigger,
			triggerWithoutExclamationMark,
			searchTerm,
			query,
		});
	}

	// Handle direct navigation commands (@settings, @bookmarks, etc)
	if (config.directBangs[query as keyof typeof config.directBangs]) {
		return res.redirect(config.directBangs[query as keyof typeof config.directBangs]);
	}

	// Handle system commands (!bm and !add)
	if (trigger && config.systemBangs.includes(trigger as (typeof config.systemBangs)[number])) {
		const result = await handleSystemCommands({ res, user, trigger, url, query });
		if (result) return result;
	}

	// Process user's custom bang commands
	if (trigger) {
		const customBang = await db('bangs')
			.join('action_types', 'bangs.action_type_id', 'action_types.id')
			.where({ 'bangs.trigger': trigger, 'bangs.user_id': user.id })
			.select('bangs.*', 'action_types.name as action_type')
			.first();

		if (customBang) {
			return res.redirect(
				customBang.action_type === 'search'
					? customBang.url.replace('{{{s}}}', encodeURIComponent(searchTerm))
					: customBang.url,
			);
		}
	}

	// Handle default bang commands
	if (triggerWithoutExclamationMark) {
		const bang = config.bangs[triggerWithoutExclamationMark] as Bang;
		if (bang) {
			return res.redirect(handleBangRedirect(bang, searchTerm));
		}
	}

	// Fall back to user's preferred search engine
	const provider = user.default_search_provider || 'duckduckgo';
	const searchUrl = defaultSearchProviders[provider].replace(
		'{{{s}}}',
		encodeURIComponent(searchTerm || triggerWithoutExclamationMark || ''),
	);

	return res.redirect(searchUrl);
}
