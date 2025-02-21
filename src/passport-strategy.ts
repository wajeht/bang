import { db } from './db/db';
import passport from 'passport';
import { appConfig, oauthConfig } from './configs';
import { Strategy as GitHubStrategy } from 'passport-github2';

passport.serializeUser((user: any, done: any) => {
	done(null, user.id);
});

passport.deserializeUser(async (id: number, done: any) => {
	try {
		const user = await db('users').where({ id }).first();
		done(null, user);
	} catch (error) {
		done(error as Error, null);
	}
});

passport.use(
	new GitHubStrategy(
		{
			clientID: oauthConfig.github.client_id,
			clientSecret: oauthConfig.github.client_secret,
			callbackURL: '/oauth/github/redirect',
			scope: ['user:email'],
		},
		async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
			try {
				const emails = profile.emails || [];
				const email = emails[0]?.value;

				if (!email) {
					return done(new Error('No email address found in GitHub profile'), undefined);
				}

				let user = await db('users').where({ email }).first();
				let isNewUser = false;

				if (!user) {
					isNewUser = true;
					[user] = await db('users')
						.insert({
							username: email.split('@')[0],
							email,
							is_admin: appConfig.adminEmail === email,
						})
						.returning('*');
				}

				return done(null, user, { isNewUser });
			} catch (error) {
				return done(error as Error, undefined);
			}
		},
	),
);

export { passport };
