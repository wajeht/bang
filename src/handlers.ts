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

		// await sendGeneralEmailJob({
		// 	email: foundUser.email,
		// 	subject: 'Welcome to 🔔 bang!',
		// 	username: foundUser.username,
		// 	message: 'Thanks for using bang. Let us know if we can help you with anything!',
		// });

		return res.redirect(`/apps?toast=${encodeURIComponent('🎉 enjoy bang!')}`);
	}

	req.session.user = foundUser;
	req.session.save();

	return res.redirect(
		`/apps?toast=${encodeURIComponent(`🙏 welcome back, ${foundUser.username}!`)}`,
	);
}
