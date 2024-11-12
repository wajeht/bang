import { fetchPageTitle, getGithubOauthToken, getGithubUserEmails } from './utils';
import { appConfig, oauthConfig } from './configs';
import { HttpError, UnauthorizedError } from './errors';
import { Request, Response } from 'express';
import { db } from './db/db';
import { logger } from './logger';

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
export async function getDashboardPageHandler(req: Request, res: Response) {
	const actions = await db('bangs')
		.join('action_types', 'bangs.action_type_id', 'action_types.id')
		.where('bangs.user_id', req.session.user!.id)
		.select(
			'bangs.id',
			'bangs.name',
			'bangs.trigger',
			'bangs.url',
			'action_types.name as action_type',
			'bangs.created_at',
		)
		.orderBy('bangs.created_at', 'desc');

	return res.render('dashboard.html', {
		path: '/dashboard',
		layout: '../layouts/dashboard.html',
		actions,
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

// GET /
export async function getHomePageAndSearchHandler(req: Request, res: Response) {
	const query = req.query.q?.toString().trim() || '';
	const userId = req.session.user?.id;

	// Handle empty query first
	if (!query) {
		if (!req.session?.user) {
			return res.render('home.html', {
				path: '/',
			});
		}

		return res.redirect('/dashboard');
	}

	// Check if it's any bang command (including !add)
	const isBangCommand = query.startsWith('!');

	// Require auth for all bang commands
	if (isBangCommand && !req.session?.user) {
		return res.redirect('/login');
	}

	// Handle !add command with URL
	if (query.startsWith('!add')) {
		const urlToBookmark = query.slice(5).trim();

		if (urlToBookmark) {
			try {
				await db('bookmarks').insert({
					user_id: userId,
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
									</script>
							`);
				return;
			}
		}

		// If no URL provided in !add command, go back
		res.setHeader('Content-Type', 'text/html').send(`
					<script>
							alert("No URL provided for bookmark");
							window.history.back();
					</script>
			`);
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
				'bangs.user_id': userId,
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

	// If no bang command matches or user not authenticated for bangs,
	// do a regular DDG search
	return res.redirect(`https://duckduckgo.com/?q=${encodeURIComponent(query)}`);
}

// POST /actions
export async function postActionHandler(req: Request, res: Response) {
	const { trigger, url, actionType, name } = req.body;

	// Validation
	if (!trigger || !url || !actionType) {
		return res.redirect(
			`/actions/create?error=${encodeURIComponent('All fields are required')}&trigger=${encodeURIComponent(trigger || '')}&url=${encodeURIComponent(url || '')}&actionType=${encodeURIComponent(actionType || '')}`,
		);
	}

	// Ensure trigger starts with !
	const formattedTrigger = trigger.startsWith('!') ? trigger : `!${trigger}`;

	// Validate action type
	if (!['search', 'redirect'].includes(actionType)) {
		return res.redirect(
			`/actions/create?error=${encodeURIComponent('Invalid action type')}&trigger=${encodeURIComponent(trigger)}&url=${encodeURIComponent(url)}`,
		);
	}

	try {
		// Check if trigger already exists for this user
		const existingBang = await db('bangs')
			.where({
				trigger: formattedTrigger,
				user_id: req.session.user!.id,
			})
			.first();

		if (existingBang) {
			return res.redirect(
				`/actions/create?error=${encodeURIComponent('This trigger already exists')}&trigger=${encodeURIComponent(trigger)}&url=${encodeURIComponent(url)}&actionType=${encodeURIComponent(actionType)}`,
			);
		}

		// Get action type ID
		const actionTypeRecord = await db('action_types')
			.where({
				name: actionType === 'search' ? 'search' : 'redirect',
			})
			.first();

		if (!actionTypeRecord) {
			throw HttpError(404, 'Action type not found in database');
		}

		// Insert new bang
		await db('bangs').insert({
			trigger: formattedTrigger,
			name: name.trim(),
			url: url,
			user_id: req.session.user!.id,
			action_type_id: actionTypeRecord.id,
			created_at: new Date(),
		});

		return res.redirect(
			'/dashboard?toast=' + encodeURIComponent(`Action ${formattedTrigger} created successfully!`),
		);
	} catch (error) {
		return res.redirect(
			`/actions/create?error=${encodeURIComponent('An error occurred while creating the action')}&trigger=${encodeURIComponent(trigger)}&url=${encodeURIComponent(url)}&actionType=${encodeURIComponent(actionType)}`,
		);
	}
}

// GET /actions/create
export function getActionCreatePageHandler(req: Request, res: Response) {
	return res.render('actions-create.html', {
		path: '/actions/create',
		layout: '../layouts/dashboard.html',
		error: req.query.error,
		success: req.query.success,
		formData: {
			name: req.query.name || '',
			trigger: req.query.trigger || '',
			url: req.query.url || '',
			actionType: req.query.actionType || 'search',
		},
	});
}

// GET /bookmarks
export async function getBookmarksPageHandler(req: Request, res: Response) {
	// Get all bookmarks for the current user
	const bookmarks = await db('bookmarks')
		.where('user_id', req.session.user!.id)
		.select('id', 'title', 'url', 'created_at')
		.orderBy('created_at', 'desc');

	return res.render('bookmarks', {
		path: '/bookmarks',
		layout: '../layouts/dashboard',
		bookmarks,
		toast: req.query.toast,
	});
}

// DELETE /bookmarks/:id
export async function deleteBookmarkHandler(req: Request, res: Response) {
	await db('bookmarks')
		.where({
			id: req.params.id,
			user_id: req.session.user!.id,
		})
		.delete();

	return res.redirect('/bookmarks?toast=' + encodeURIComponent('Bookmark deleted successfully'));
}
