import {
	createBookmarksDocument,
	fetchPageTitle,
	getGithubOauthToken,
	getGithubUserEmails,
} from './utils';
import { appConfig, oauthConfig } from './configs';
import { HttpError, NotFoundError, UnauthorizedError, ValidationError } from './errors';
import { Request, Response } from 'express';
import { db } from './db/db';
import { logger } from './logger';
import { BookmarkToExport, User } from './types';
import { validateRequestMiddleware } from './middlewares';
import { body } from 'express-validator';

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
		title: 'Terms of Service',
	});
}

// GET /privacy-policy
export function getPrivacyPolicyPageHandler(req: Request, res: Response) {
	return res.render('privacy-policy', {
		path: '/privacy-policy',
		title: 'Privacy Policy',
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
		return res.redirect('/actions');
	}

	return res.redirect('/oauth/github');
}

// GET /oauth/github
export async function getGithubHandler(req: Request, res: Response) {
	if (req.session?.user) {
		return res.redirect('/actions');
	}

	const rootUrl = 'https://github.com/login/oauth/authorize';

	const qs = new URLSearchParams({
		redirect_uri: oauthConfig.github.redirect_uri,
		client_id: oauthConfig.github.client_id,
		scope: 'user:email',
	});

	return res.redirect(`${rootUrl}?${qs.toString()}`);
}

// GET /actions
export async function getActionsPageHandler(req: Request, res: Response) {
	const actions = await db('bangs')
		.join('action_types', 'bangs.action_type_id', 'action_types.id')
		.where('bangs.user_id', req.session.user?.id)
		.select(
			'bangs.id',
			'bangs.name',
			'bangs.trigger',
			'bangs.url',
			'action_types.name as action_type',
			'bangs.created_at',
		)
		.orderBy('bangs.created_at', 'desc');

	return res.render('actions.html', {
		path: '/actions',
		title: 'Actions',
		layout: '../layouts/auth.html',
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
	}

	req.session.user = foundUser;

	const redirectTo = req.session.redirectTo;
	delete req.session.redirectTo;
	req.session.save();

	if (redirectTo) {
		return res.redirect(redirectTo);
	}

	if (!foundUser) {
		return res.redirect(`/actions?toast=${encodeURIComponent('🎉 enjoy bang!')}`);
	}

	return res.redirect(
		`/actions?toast=${encodeURIComponent(`🙏 welcome back, ${foundUser.username}!`)}`,
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
				title: "DuckDuckGo's !Bangs, but on steroids.",
			});
		}

		return res.redirect('/actions');
	}

	// Check if it's any bang command (including !add)
	const isBangCommand = query.startsWith('!');

	// Require auth for all bang commands
	if (isBangCommand && !req.session?.user) {
		req.session.redirectTo = req.originalUrl;
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
export const postActionHandler = [
	validateRequestMiddleware([
		body('url').notEmpty().withMessage('URL is required').isURL().withMessage('Invalid URL format'),
		body('name').notEmpty().withMessage('Name is required').trim(),
		body('actionType')
			.notEmpty()
			.withMessage('Action type is required')
			.isIn(['search', 'redirect'])
			.withMessage('Invalid action type'),
		body('trigger')
			.notEmpty()
			.withMessage('Trigger is required')
			.custom(async (trigger, { req }) => {
				const formattedTrigger = trigger.startsWith('!') ? trigger : `!${trigger}`;

				const existingBang = await db('bangs')
					.where({
						trigger: formattedTrigger,
						user_id: req.session.user?.id,
					})
					.first();

				if (existingBang) {
					throw ValidationError('This trigger already exists');
				}

				return true;
			}),
	]),
	async (req: Request, res: Response) => {
		const { trigger, url, actionType, name } = req.body;
		const formattedTrigger = trigger.startsWith('!') ? trigger : `!${trigger}`;

		await db('bangs').insert({
			trigger: formattedTrigger,
			name: name.trim(),
			url: url,
			user_id: req.session.user!.id,
			action_type_id: (await db('action_types').where({ name: actionType }).first()).id,
			created_at: new Date(),
		});

		req.flash('success', `Action ${formattedTrigger} created successfully!`);
		return res.redirect('/actions');
	},
];

// GET /actions/create
export function getActionCreatePageHandler(req: Request, res: Response) {
	return res.render('actions-create.html', {
		title: 'Actions / New',
		path: '/actions/create',
		layout: '../layouts/auth.html',
	});
}

// GET /bookmarks
export async function getBookmarksPageHandler(req: Request, res: Response) {
	const bookmarks = await db('bookmarks')
		.where('user_id', req.session.user?.id)
		.select('id', 'title', 'url', 'created_at')
		.orderBy('created_at', 'desc');

	return res.render('bookmarks', {
		title: 'Bookmarks',
		path: '/bookmarks',
		layout: '../layouts/auth',
		bookmarks,
	});
}

// POST /bookmarks/:id/delete
export async function postDeleteBookmarkHandler(req: Request, res: Response) {
	await db('bookmarks')
		.where({
			id: req.params.id,
			user_id: req.session.user?.id,
		})
		.delete();

	req.flash('success', 'Bookmark deleted successfully');
	return res.redirect('/bookmarks');
}

// POST /actions/:id/delete
export async function postDeleteActionHandler(req: Request, res: Response) {
	const action = await db('bangs')
		.where({
			id: req.params.id,
			user_id: req.session.user!.id,
		})
		.first();

	if (!action) {
		throw NotFoundError();
	}

	await db('bangs')
		.where({
			id: req.params.id,
			user_id: req.session.user?.id,
		})
		.delete();

	req.flash('success', `Action ${action.trigger} deleted successfully`);
	return res.redirect('/actions');
}

// GET /actions/:id/edit
export async function getEditActionPageHandler(req: Request, res: Response) {
	const action = await db('bangs')
		.join('action_types', 'bangs.action_type_id', 'action_types.id')
		.where({
			'bangs.id': req.params.id,
			'bangs.user_id': req.session.user?.id,
		})
		.select('bangs.*', 'action_types.name as action_type')
		.first();

	if (!action) {
		throw NotFoundError();
	}

	return res.render('actions-edit.html', {
		title: 'Actions / Edit',
		path: '/actions/edit',
		layout: '../layouts/auth.html',
		action,
	});
}

// POST /actions/:id/update
export async function postUpdateActionHandler(req: Request, res: Response) {
	const { trigger, url, actionType, name } = req.body;
	const actionId = req.params.id;

	// Validation
	if (!trigger || !url || !actionType || !name) {
		return res.redirect(
			`/actions/${actionId}/edit?error=${encodeURIComponent('All fields are required')}`,
		);
	}

	// Ensure trigger starts with !
	const formattedTrigger = trigger.startsWith('!') ? trigger : `!${trigger}`;

	// Validate action type
	if (!['search', 'redirect'].includes(actionType)) {
		return res.redirect(
			`/actions/${actionId}/edit?error=${encodeURIComponent('Invalid action type')}`,
		);
	}

	// Check if trigger already exists for this user (excluding current action)
	const existingBang = await db('bangs')
		.where({
			trigger: formattedTrigger,
			user_id: req.session.user?.id,
		})
		.whereNot('id', actionId)
		.first();

	if (existingBang) {
		return res.redirect(
			`/actions/${actionId}/edit?error=${encodeURIComponent('This trigger already exists')}`,
		);
	}

	// Get action type ID
	const actionTypeRecord = await db('action_types')
		.where({
			name: actionType,
		})
		.first();

	if (!actionTypeRecord) {
		throw HttpError(404, 'Action type not found in database');
	}

	// Update the bang
	await db('bangs')
		.where({
			id: actionId,
			user_id: req.session.user?.id,
		})
		.update({
			trigger: formattedTrigger,
			name: name.trim(),
			url: url,
			action_type_id: actionTypeRecord.id,
			updated_at: new Date(),
		});

	req.flash('success', 'Action updated successfully!');
	return res.redirect('/actions');
}

// GET /settings
export async function getSettingsPageHandler(req: Request, res: Response) {
	res.redirect('/settings/account');
}

// GET /settings/account
export async function getSettingsAccountPageHandler(req: Request, res: Response) {
	return res.render('settings-account.html', {
		user: req.session?.user,
		title: 'Settings Account',
		path: '/settings/account',
		layout: '../layouts/settings.html',
	});
}

// POST /settings/account
export const postSettingsAccountHandler = [
	validateRequestMiddleware([
		body('username')
			.notEmpty()
			.custom(async (username, { req }) => {
				const userId = req.session?.user?.id;

				const existingUser = await db
					.select('*')
					.from('users')
					.where('username', username)
					.whereNot('id', userId)
					.first();

				if (existingUser) {
					throw ValidationError('Username is already taken');
				}

				return true;
			}),
		body('email')
			.notEmpty()
			.isEmail()
			.custom(async (email, { req }) => {
				const userId = req.session?.user?.id;

				const existingUser = await db
					.select('*')
					.from('users')
					.where('email', email)
					.whereNot('id', userId)
					.first();

				if (existingUser) {
					throw ValidationError('Email is already in use');
				}

				return true;
			}),
	]),
	async (req: Request, res: Response) => {
		const { email, username } = req.body;

		await db('users').update({ email, username }).where({ id: req.session.user?.id });

		req.flash('success', '🔄 updated!');
		return res.redirect('/settings/account');
	},
];

// GET /settings/data
export async function getSettingsDataPageHandler(req: Request, res: Response) {
	return res.render('settings-data.html', {
		user: req.session?.user,
		title: 'Settings Data',
		path: '/settings/data',
		layout: '../layouts/settings.html',
	});
}

// POST /settings/data
export async function postSettingsDataPageHandler(req: Request, res: Response) {
	const apps = await db.select('*').from('apps').where('user_id', req.session.user?.id);

	if (!apps.length) {
		req.flash('info', '🤷 nothing to export!');
		return res.redirect('/settings/data');
	}

	req.flash('info', '🎉 we will send you an email very shortly');
	return res.redirect('/settings/data');
}

// GET /settings/danger-zone
export async function getSettingsDangerZonePageHandler(req: Request, res: Response) {
	return res.render('settings-danger-zone.html', {
		title: 'Settings Danger Zone',
		user: req.session?.user,
		path: '/settings/danger-zone',
		layout: '../layouts/settings.html',
	});
}

// POST /settings/danger-zone/delete
export async function postDeleteSettingsDangerZoneHandler(req: Request, res: Response) {
	await db('users').where({ id: req.session.user?.id }).delete();

	if (req.session && req.session?.user) {
		req.session.user = undefined;
		req.session.destroy((error) => {
			if (error) {
				throw HttpError(error);
			}
		});
	}

	return res.redirect('/?toast=🗑️ deleted');
}

// GET /bookmarks/export
export async function getExportBookmarksHandler(req: Request, res: Response) {
	const bookmarks = (await db
		.select('url', 'title', db.raw('EXTRACT(EPOCH FROM created_at)::integer as add_date'))
		.from('bookmarks')
		.where({
			user_id: req.session.user?.id,
		})) as BookmarkToExport[];

	if (!bookmarks.length) {
		req.flash('info', 'no bookmarks to export yet.');
		return res.redirect('/bookmarks');
	}

	res.setHeader('Content-Disposition', 'attachment; filename=bookmarks.html');
	res.setHeader('Content-Type', 'text/html; charset=UTF-8');
	res.send(createBookmarksDocument(bookmarks));
}
