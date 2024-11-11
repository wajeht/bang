import { getGithubOauthToken, getGithubUserEmails } from './utils';
import { appConfig, oauthConfig } from './configs';
import { HttpError, UnauthorizedError } from './errors';
import { Request, Response } from 'express';
import { db } from './db/db';

// GET /
export function getHomePageHandler(req: Request, res: Response) {
	if (req.session?.user) {
		res.redirect('/dashboard');
		return;
	}

	res.render('home.html', {
		path: '/',
	});
}

// GET /healthz
export function getHealthzHandler(req: Request, res: Response) {
	if (req.get('Content-Type') === 'application/json') {
		res.status(200).json({ message: 'ok' });
		return;
	}

	res.setHeader('Content-Type', 'text/html').status(200).send('<p>ok</p>');
}

// GET /terms-of-service
export function getTermsOfServicePageHandler(req: Request, res: Response) {
	return res.render('terms-of-service.html', {
		path: '/terms-of-service',
	});
}

// GET /privacy-policy
export function getPrivacyPolicyPageHandler(req: Request, res: Response) {
	return res.render('privacy-policy', {
		path: '/privacy-policy',
	});
}

// GET /logout
export function getLogoutHandler(req: Request, res: Response) {
	if (req.session && req.session?.user) {
		req.session.user = undefined;
		req.session.destroy((error) => {
			if (error) {
				throw HttpError(error);
			}
		});
	}

	return res.redirect('/');
}

// GET /login
export function getLoginHandler(req: Request, res: Response) {
	if (req.session?.user) {
		return res.redirect('/dashboard');
	}

	return res.redirect('/oauth/github');
}

// GET /oauth/github
export async function getGithubHandler(req: Request, res: Response) {
	if (req.session?.user) {
		return res.redirect('/dashboard');
	}

	const rootUrl = 'https://github.com/login/oauth/authorize';

	const qs = new URLSearchParams({
		redirect_uri: oauthConfig.github.redirect_uri,
		client_id: oauthConfig.github.client_id,
		scope: 'user:email',
	});

	return res.redirect(`${rootUrl}?${qs.toString()}`);
}

// GET /dashboard
export function getDashboardPageHandler(req: Request, res: Response) {
	return res.render('dashboard.html', {
		path: '/dashboard',
		layout: '../layouts/dashboard.html',
	});
}

// GET /oauth/github/redirect
export async function getGithubRedirect(req: Request, res: Response) {
	const code = req.query.code as string;

	if (!code) {
		throw UnauthorizedError('Something went wrong while authenticating with github');
	}

	const { access_token } = await getGithubOauthToken(code);

	const emails = await getGithubUserEmails(access_token);

	const email = emails.filter((email) => email.primary && email.verified)[0]?.email;

	let foundUser = await db.select('*').from('users').where({ email }).first();

	if (!foundUser) {
		[foundUser] = await db('users')
			.insert({
				username: email?.split('@')[0],
				email,
				is_admin: appConfig.adminEmail === email,
			})
			.returning('*');

		req.session.user = foundUser;
		req.session.save();

		return res.redirect(`/dashboard?toast=${encodeURIComponent('🎉 enjoy bang!')}`);
	}

	req.session.user = foundUser;
	req.session.save();

	return res.redirect(
		`/dashboard?toast=${encodeURIComponent(`🙏 welcome back, ${foundUser.username}!`)}`,
	);
}

// GET /search
export async function getSearchHandler(req: Request, res: Response) {
	const query = req.query.q?.toString().trim() || '';
	const userId = req.session.user?.id;

	// Check for !add anywhere in the query
	const addMatch = query.match(/!add(?:\s+(.*))?/);

	if (addMatch) {
		let urlToBookmark = addMatch[1]?.trim() || '';

		// If no URL provided in command, use referer
		if (!urlToBookmark && req.headers.referer) {
			urlToBookmark = req.headers.referer;
		}

		if (urlToBookmark) {
			try {
				urlToBookmark = decodeURIComponent(urlToBookmark!);
				// Remove any extra content after URL
				urlToBookmark = urlToBookmark.split(/\s+/)[0]!;
				// Add https:// if no protocol specified
				if (!urlToBookmark.startsWith('http')) {
					urlToBookmark = 'https://' + urlToBookmark;
				}
			} catch {
				// If decoding fails, use as-is
			}

			await db('bookmarks').insert({
				user_id: userId,
				url: urlToBookmark,
				title: req.query.title?.toString() || 'Untitled',
				created_at: new Date(),
			});

			return res.redirect(urlToBookmark);
		}
		return res.redirect('/');
	}

	// Extract bang and search query
	const bangMatch = query.match(/^!(\w+)(?:\s+(.*))?$/);

	if (bangMatch) {
		const [, bangTrigger, searchQuery = ''] = bangMatch;

		const customBang = await db('bangs')
			.join('action_types', 'bangs.action_type_id', 'action_types.id')
			.where({
				'bangs.trigger': `!${bangTrigger}`,
				'bangs.user_id': userId,
			})
			.select('bangs.*', 'action_types.name as action_type')
			.first();

		if (customBang) {
			// Handle redirect type
			if (customBang.action_type_id === 2) {
				return res.redirect(customBang.url);
			}

			// Handle search type
			if (customBang.action_type_id === 1) {
				const searchUrl = customBang.url.replace('{query}', encodeURIComponent(searchQuery));
				return res.redirect(searchUrl);
			}
		}

		// If bang exists but wasn't handled, fall through to DDG
		return res.redirect(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`);
	}

	// No bang found, do a regular DDG search
	return res.redirect(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`);
}
