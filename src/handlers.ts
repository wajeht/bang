import {
	api,
	bookmark,
	expectJson,
	extractUser,
	github,
	search,
	extractPagination,
	insertBookmarkQueue,
} from './utils';
import { db } from './db/db';
import { body } from 'express-validator';
import { Request, Response } from 'express';
import { ApiKeyPayload, BookmarkToExport } from './types';
import { validateRequestMiddleware } from './middlewares';
import { actionTypes, appConfig, defaultSearchProviders, oauthConfig } from './configs';
import { HttpError, NotFoundError, UnauthorizedError, ValidationError } from './errors';

// GET /healthz
export function getHealthzHandler(req: Request, res: Response) {
	if (expectJson(req)) {
		res.status(200).json({ message: 'ok' });
		return;
	}

	res.setHeader('Content-Type', 'text/html').status(200).send('<p>ok</p>');
}

// GET /terms-of-service
export function getTermsOfServicePageHandler(_req: Request, res: Response) {
	return res.render('terms-of-service.html', {
		path: '/terms-of-service',
		title: 'Terms of Service',
	});
}

// GET /privacy-policy
export function getPrivacyPolicyPageHandler(_req: Request, res: Response) {
	return res.render('privacy-policy', {
		path: '/privacy-policy',
		title: 'Privacy Policy',
	});
}

// GET /logout
export function getLogoutHandler(req: Request, res: Response) {
	if (req.session && req.session.user) {
		req.session.user = undefined;
		req.session.destroy((error) => {
			if (error) {
				throw HttpError(error);
			}
		});
	}

	return res.redirect(`/?toast=${encodeURIComponent('✌️ see ya!')}`);
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
		req.flash('info', "you've already been logged in!");
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
	const user = await extractUser(req);
	const { perPage, page, search, sortKey, direction } = extractPagination(req, user);

	const query = db
		.select(
			'bangs.id',
			'bangs.name',
			'bangs.trigger',
			'bangs.url',
			'action_types.name as action_type',
			'bangs.created_at',
		)
		.from('bangs')
		.where('bangs.user_id', user.id)
		.join('action_types', 'bangs.action_type_id', 'action_types.id');

	if (search) {
		query.where((q) => {
			q.where(db.raw('LOWER(bangs.name) LIKE ?', [`%${search}%`]))
				.orWhere(db.raw('LOWER(bangs.trigger) LIKE ?', [`%${search}%`]))
				.orWhere(db.raw('LOWER(bangs.url) LIKE ?', [`%${search}%`]));
		});
	}

	if (
		sortKey === 'name' ||
		sortKey === 'trigger' ||
		sortKey === 'url' ||
		sortKey === 'created_at'
	) {
		query.orderBy(`bangs.${sortKey}`, direction === 'desc' ? 'desc' : 'asc');
	} else if (sortKey === 'action_type') {
		query.orderBy(`action_types.name`, direction === 'desc' ? 'desc' : 'asc');
	} else {
		query.orderBy('bangs.created_at', 'desc');
	}

	const { data: actions, pagination } = await query.paginate({
		perPage,
		currentPage: page,
		isLengthAware: true,
	});

	if (expectJson(req)) {
		res.json({
			actions,
			pagination,
			search,
			sortKey,
			direction,
		});
		return;
	}

	return res.render('actions.html', {
		path: '/actions',
		title: 'Actions',
		layout: '../layouts/auth.html',
		actions,
		pagination,
		search,
		sortKey,
		direction,
	});
}

// GET /oauth/github/redirect
export async function getGithubRedirectHandler(req: Request, res: Response) {
	const code = req.query.code as string;

	if (!code) {
		throw UnauthorizedError('Something went wrong while authenticating with github');
	}

	const { access_token } = await github.getOauthToken(code);

	const emails = await github.getUserEmails(access_token);

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
		req.flash('success', '✌️ enjoy bang!');
		return res.redirect('/actions');
	}

	req.flash('success', `🙏 welcome back, ${foundUser.username}!`);
	return res.redirect('/actions');
}

// POST /search
export async function postSearchHandler(req: Request, res: Response) {
	const query = req.body.q?.toString().trim() || '';
	const user = req.session.user;
	await search({ res, user, query, req });
}

// GET /
export async function getHomePageAndSearchHandler(req: Request, res: Response) {
	const query = req.query.q?.toString().trim() || '';
	const user = req.session.user;

	if (!query) {
		if (!user) {
			return res.render('home.html', {
				path: '/',
				title: "DuckDuckGo's !Bangs, but on steroids.",
			});
		}

		return res.render('search.html', {
			path: '/',
			title: 'Search',
			layout: '../layouts/search.html',
		});
	}

	await search({ res, user, query, req });
}

// POST /actions
export const postActionHandler = [
	validateRequestMiddleware([
		body('url').notEmpty().withMessage('URL is required').isURL().withMessage('Invalid URL format'),
		body('name').notEmpty().withMessage('Name is required').trim(),
		body('actionType')
			.notEmpty()
			.withMessage('Action type is required')
			.isIn(actionTypes)
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
			url,
			user_id: req.session.user!.id,
			action_type_id: (await db('action_types').where({ name: actionType }).first()).id,
			created_at: db.fn.now(),
		});

		req.flash('success', `Action ${formattedTrigger} created successfully!`);
		return res.redirect('/actions');
	},
];

// GET /bookmarks/create
export function getBookmarkCreatePageHandler(_req: Request, res: Response) {
	return res.render('bookmarks-create.html', {
		title: 'Bookmarks / New',
		path: '/bookmarks/create',
		layout: '../layouts/auth.html',
	});
}

// GET /actions/create
export function getActionCreatePageHandler(_req: Request, res: Response) {
	return res.render('actions-create.html', {
		title: 'Actions / New',
		path: '/actions/create',
		layout: '../layouts/auth.html',
		actionTypes,
	});
}

// GET /bookmarks
export async function getBookmarksPageHandler(req: Request, res: Response) {
	const user = await extractUser(req);
	const { perPage, page, search, sortKey, direction } = extractPagination(req, user);

	const query = db.select('*').from('bookmarks').where('user_id', user.id);

	if (search) {
		query.where((q) => {
			q.where(db.raw('LOWER(title) LIKE ?', [`%${search}%`])).orWhere(
				db.raw('LOWER(url) LIKE ?', [`%${search}%`]),
			);
		});
	}

	if (sortKey === 'title' || sortKey === 'url' || sortKey === 'created_at') {
		query.orderBy(`bookmarks.${sortKey}`, direction === 'desc' ? 'desc' : 'asc');
	} else {
		query.orderBy('bookmarks.created_at', 'desc');
	}

	const { data: bookmarks, pagination } = await query.paginate({
		perPage,
		currentPage: page,
		isLengthAware: true,
	});

	if (expectJson(req)) {
		res.json({
			bookmarks,
			pagination,
			search,
			sortKey,
			direction,
		});
		return;
	}

	return res.render('bookmarks', {
		title: 'Bookmarks',
		path: '/bookmarks',
		layout: '../layouts/auth',
		bookmarks,
		search,
		pagination,
		sortKey,
		direction,
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
	const action = await db
		.select('bangs.*', 'action_types.name as action_type')
		.from('bangs')
		.where({
			'bangs.id': req.params.id,
			'bangs.user_id': req.session.user?.id,
		})
		.join('action_types', 'bangs.action_type_id', 'action_types.id')
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
export const postUpdateActionHandler = [
	validateRequestMiddleware([
		body('url').notEmpty().withMessage('URL is required').isURL().withMessage('Invalid URL format'),
		body('name').notEmpty().withMessage('Name is required').trim(),
		body('actionType')
			.notEmpty()
			.withMessage('Action type is required')
			.isIn(actionTypes)
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
					.whereNot('id', req.params?.id)
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

		await db('bangs')
			.where({ id: req.params?.id, user_id: req.session.user?.id })
			.update({
				trigger: formattedTrigger,
				name: name.trim(),
				url,
				action_type_id: (await db('action_types').where({ name: actionType }).first()).id,
				updated_at: db.fn.now(),
			});

		req.flash('success', `Action ${formattedTrigger} updated successfully!`);
		return res.redirect('/actions');
	},
];

// GET /bookmarks/:id/actions/create
export async function getBookmarkActionCreatePageHandler(req: Request, res: Response) {
	const bookmark = await db('bookmarks')
		.where({
			id: req.params.id,
			user_id: req.session.user?.id,
		})
		.first();

	return res.render('bookmarks-id-actions-create.html', {
		title: `Bookmarks / ${req.params.id} / Actions / Create`,
		path: `/bookmarks/${req.params.id}/actions/create`,
		layout: '../layouts/auth.html',
		bookmark,
	});
}

// POST /bookmarks/:id/update
export const postUpdateBookmarkHandler = [
	validateRequestMiddleware([
		body('url').notEmpty().withMessage('URL is required').isURL().withMessage('Invalid URL format'),
		body('title').notEmpty().withMessage('Title is required').trim(),
	]),
	async (req: Request, res: Response) => {
		const { url, title } = req.body;

		await db('bookmarks')
			.where({ id: req.params?.id, user_id: req.session.user?.id })
			.update({
				title: title || 'Fetching...',
				url,
				updated_at: db.fn.now(),
			});

		req.flash('success', `Bookmark ${req.params?.id} updated successfully!`);
		return res.redirect('/bookmarks');
	},
];

// GET /settings
export async function getSettingsPageHandler(_req: Request, res: Response) {
	res.redirect('/settings/account');
}

// GET /settings/account
export async function getSettingsAccountPageHandler(req: Request, res: Response) {
	return res.render('settings-account.html', {
		user: req.session?.user,
		title: 'Settings Account',
		path: '/settings/account',
		layout: '../layouts/settings.html',
		defaultSearchProviders: Object.keys(defaultSearchProviders),
	});
}

// POST /settings/create-api-key
export async function postSettingsCreateApiKeyHandler(req: Request, res: Response) {
	const user = await db('users').where({ id: req.session.user?.id }).first();

	if (!user) {
		throw NotFoundError();
	}

	const newKeyVersion = (user.api_key_version || 0) + 1;

	const payload: ApiKeyPayload = {
		userId: user.id,
		apiKeyVersion: newKeyVersion,
	};

	await db('users')
		.where({ id: req.session?.user?.id })
		.update({
			api_key: await api.generate(payload),
			api_key_version: newKeyVersion,
			api_key_created_at: db.fn.now(),
		});

	req.flash('success', '📱 api key created');

	return res.redirect(`/settings/account`);
}

// POST /settings/account
export const postSettingsAccountHandler = [
	validateRequestMiddleware([
		body('username')
			.notEmpty()
			.custom(async (username, { req }) => {
				const existingUser = await db
					.select('*')
					.from('users')
					.where('username', username)
					.whereNot('id', req.session?.user?.id)
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
				const existingUser = await db
					.select('*')
					.from('users')
					.where('email', email)
					.whereNot('id', req.session?.user?.id)
					.first();

				if (existingUser) {
					throw ValidationError('Email is already in use');
				}

				return true;
			}),
		body('default_search_provider')
			.notEmpty()
			.isIn(Object.keys(defaultSearchProviders))
			.withMessage('Invalid search provider selected'),
		body('default_per_page').notEmpty().isInt().withMessage('must be an integer'),
	]),
	async (req: Request, res: Response) => {
		const { email, username, default_search_provider, default_per_page } = req.body;

		await db('users')
			.update({
				email,
				username,
				default_search_provider,
				default_per_page,
			})
			.where({ id: req.session.user?.id });

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

// POST /settings/data/export
export const postExportDataHandler = [
	validateRequestMiddleware([
		body('options').custom((value) => {
			if (value === undefined) {
				throw ValidationError('Please select at least one data type to export');
			}
			return true;
		}),
	]),
	async (req: Request, res: Response) => {
		const userId = req.session.user?.id;
		const includeBookmarks = req.body.options.includes('bookmarks');
		const includeActions = req.body.options.includes('actions');

		const exportData: {
			exported_at: string;
			version: string;
			bookmarks?: any[];
			actions?: any[];
		} = {
			exported_at: new Date().toISOString(),
			version: '1.0',
		};

		const fetchBookmarks = () =>
			includeBookmarks
				? db('bookmarks').where('user_id', userId).select('title', 'url', 'created_at')
				: Promise.resolve([]);

		const fetchActions = () =>
			includeActions
				? db
						.select(
							'bangs.trigger',
							'bangs.name',
							'bangs.url',
							'action_types.name as action_type',
							'bangs.created_at',
						)
						.from('bangs')
						.join('action_types', 'bangs.action_type_id', 'action_types.id')
						.where('bangs.user_id', userId)
				: Promise.resolve([]);

		const [bookmarks, actions] = await Promise.all([fetchBookmarks(), fetchActions()]);

		if (includeBookmarks) exportData.bookmarks = bookmarks;
		if (includeActions) exportData.actions = actions;

		res.setHeader(
			'Content-Disposition',
			`attachment; filename=bang-data-export-${exportData.exported_at}.json`,
		);
		res.setHeader('Content-Type', 'application/json');
		res.send(JSON.stringify(exportData, null, 2));
	},
];

// GET /bookmarks/:id/edit
export async function getEditBookmarkPageHandler(req: Request, res: Response) {
	const bookmark = await db('bookmarks')
		.where({
			id: req.params.id,
			user_id: req.session.user?.id,
		})
		.first();

	if (!bookmark) {
		throw NotFoundError();
	}

	return res.render('bookmarks-edit.html', {
		title: 'Bookmark / Edit',
		path: '/bookmark/edit',
		layout: '../layouts/auth.html',
		bookmark,
	});
}

// POST /settings/data/import
export const postImportDataHandler = [
	validateRequestMiddleware([
		body('config')
			.notEmpty()
			.withMessage('config must not be empty')
			.custom((value) => {
				try {
					const parsed = JSON.parse(value);

					if (!parsed.version || parsed.version !== '1.0') {
						throw ValidationError('Config version must be 1.0');
					}
				} catch (error) {
					throw ValidationError('Invalid JSON format');
				}

				return true;
			}),
	]),
	async (req: Request, res: Response) => {
		const userId = req.session.user?.id;
		const importData = JSON.parse(req.body.config);

		try {
			await db.transaction(async (trx) => {
				if (importData.bookmarks?.length > 0) {
					const bookmarks = importData.bookmarks.map((bookmark: any) => ({
						user_id: userId,
						title: bookmark.title,
						url: bookmark.url,
						created_at: db.fn.now(),
					}));
					await trx('bookmarks').insert(bookmarks);
				}

				if (importData.actions?.length > 0) {
					for (const action of importData.actions) {
						const actionType = await trx('action_types').where('name', action.action_type).first();

						if (actionType) {
							await trx('bangs').insert({
								user_id: userId,
								trigger: action.trigger,
								name: action.name,
								url: action.url,
								action_type_id: actionType.id,
								created_at: db.fn.now(),
							});
						}
					}
				}
			});

			req.flash('success', 'Data imported successfully!');
		} catch (error) {
			req.flash('error', 'Failed to import data. Please check the format and try again.');
		}

		return res.redirect('/settings/data');
	},
];

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

	if (req.session && req.session.user) {
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
		.select('url', 'title', db.raw("strftime('%s', created_at) as add_date"))
		.from('bookmarks')
		.where({ user_id: req.session.user?.id })) as BookmarkToExport[];

	if (!bookmarks.length) {
		req.flash('info', 'no bookmarks to export yet.');
		return res.redirect('/bookmarks');
	}

	res.setHeader(
		'Content-Disposition',
		`attachment; filename=bookmarks-${new Date().toISOString().split('T')[0]}.html`,
	);
	res.setHeader('Content-Type', 'text/html; charset=UTF-8');
	res.send(bookmark.createDocument(bookmarks));
}

// GET /settings/data/export
export async function getExportAllDataHandler(req: Request, res: Response) {
	const userId = req.session.user?.id;

	const [user, bangs, bookmarks] = await Promise.all([
		db('users')
			.where('id', userId)
			.select('username', 'email', 'default_search_provider', 'created_at')
			.first(),
		db('bangs')
			.join('action_types', 'bangs.action_type_id', 'action_types.id')
			.where('bangs.user_id', userId)
			.select(
				'bangs.trigger',
				'bangs.name',
				'bangs.url',
				'action_types.name as action_type',
				'bangs.created_at',
			),
		db('bookmarks').where('user_id', userId).select('title', 'url', 'created_at'),
	]);

	const exportData = {
		user,
		bangs,
		bookmarks,
		exported_at: new Date().toISOString(),
	};

	const currentDate = new Date().toISOString().split('T')[0];
	const filename = `bang-data-export-${currentDate}.json`;

	res
		.setHeader('Content-Disposition', `attachment; filename=${filename}`)
		.setHeader('Content-Type', 'application/json')
		.send(JSON.stringify(exportData, null, 2));
}

// POST /bookmarks
export const postBookmarkHandler = [
	validateRequestMiddleware([
		body('url').notEmpty().withMessage('URL is required').isURL().withMessage('Invalid URL format'),
		body('title').optional().trim(),
	]),
	async (req: Request, res: Response) => {
		const { url, title } = req.body;

		insertBookmarkQueue.push({ url, userId: req.session.user!.id, title });

		req.flash('success', `Bookmark ${title} created successfully!`);
		return res.redirect('/bookmarks');
	},
];
