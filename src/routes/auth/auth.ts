import type { Request, Response } from 'express';
import type { AppContext, User } from '../../type';

export function AuthRouter(ctx: AppContext) {
    const router = ctx.libs.express.Router();

    router.get('/logout', async (req: Request, res: Response) => {
        if ((req.session && req.session.user) || req.user) {
            req.session.user = null;
            req.user = undefined;
            req.session.destroy((error) => {
                if (error) {
                    throw new ctx.errors.HttpError(500, error.message, req);
                }
            });
        }

        return res.redirect(`/?toast=${encodeURIComponent('✌️ see ya!')}`);
    });

    router.post('/login', ctx.middleware.turnstile, async (req: Request, res: Response) => {
        const { email } = req.body;

        if (!email) {
            throw new ctx.errors.ValidationError({ email: 'Email is required' });
        }

        if (!ctx.utils.validation.isValidEmail(email)) {
            throw new ctx.errors.ValidationError({
                email: 'Please enter a valid email address',
            });
        }

        let user = await ctx.db('users').where({ email }).first();

        if (user) {
            user.is_admin = Boolean(user.is_admin);
            user.autocomplete_search_on_homepage = Boolean(user.autocomplete_search_on_homepage);
        }

        if (!user) {
            const username = email.split('@')[0];
            [user] = await ctx
                .db('users')
                .insert({
                    username,
                    email,
                    is_admin: ctx.config.app.adminEmail === email,
                })
                .returning('*');

            if (user) {
                user.is_admin = Boolean(user.is_admin);
                user.autocomplete_search_on_homepage = Boolean(
                    user.autocomplete_search_on_homepage,
                );
            }
        }

        const token = ctx.utils.auth.generateMagicLink({ email });

        Promise.resolve().then(async () => {
            try {
                await ctx.utils.mail.sendMagicLinkEmail({ email, token, req });
            } catch (error) {
                ctx.logger.error('Failed to send magic link email', { error, email });
            }
        });

        req.flash(
            'success',
            `📧 Magic link sent to ${email}! Check your email and click the link to log in.`,
        );
        const referer = req.headers.referer;
        if (referer) {
            try {
                const refererUrl = new URL(referer);
                const appUrl = new URL(ctx.config.app.appUrl);
                if (refererUrl.host === appUrl.host) {
                    return res.redirect(refererUrl.pathname + refererUrl.search);
                }
            } catch {}
        }
        return res.redirect('/');
    });

    router.get('/auth/magic/:token', async (req: Request, res: Response) => {
        const { token } = req.params;

        const decoded = ctx.utils.auth.verifyMagicLink(token!);

        if (!decoded || !decoded.email) {
            throw new ctx.errors.ValidationError({
                email: 'Magic link has expired or is invalid. Please request a new one.',
            });
        }

        let user = await ctx.db('users').where({ email: decoded.email }).first();

        if (!user) {
            throw new ctx.errors.ValidationError({ email: 'User not found' });
        }

        if (!user.email_verified_at) {
            [user] = await ctx
                .db('users')
                .where({ id: user.id })
                .update({ email_verified_at: ctx.db.fn.now() })
                .returning('*');
        }

        user.is_admin = Boolean(user.is_admin);
        user.autocomplete_search_on_homepage = Boolean(user.autocomplete_search_on_homepage);

        let columnPreferences = {};
        if (user.column_preferences) {
            try {
                columnPreferences = JSON.parse(user.column_preferences);
            } catch {
                columnPreferences = {};
            }
        }

        const parsedUser = {
            ...user,
            column_preferences: columnPreferences,
        };

        const redirectTo = req.session.redirectTo || '/actions';

        req.session.regenerate((err) => {
            if (err) {
                ctx.logger.error('Failed to regenerate session', { error: err });
                throw new ctx.errors.HttpError(500, 'Session error', req);
            }

            req.user = parsedUser;
            req.session.user = parsedUser;
            req.session.userCachedAt = Date.now();

            req.session.save((saveErr) => {
                if (saveErr) {
                    ctx.logger.error('Failed to save session', { error: saveErr });
                }
                req.flash('success', `🎉 Welcome ${user.username}! You're now logged in.`);
                return res.redirect(redirectTo);
            });
        });
    });

    router.post(
        '/verify-hidden-password',
        ctx.middleware.authentication,
        async (req: Request, res: Response) => {
            const { password, resource_type, resource_id, original_query } = req.body;
            const user = req.session.user as User;
            const redirect_url = req.body.redirect_url || req.headers.referer || '/';

            if (!password) {
                req.flash('error', 'Password is required');
                const url = new URL('http://localhost' + redirect_url);
                url.searchParams.set('verify-password-modal', 'true');
                return res.redirect(url.pathname + url.search);
            }

            const dbUser = await ctx.db('users').where({ id: user.id }).first();
            if (!dbUser?.hidden_items_password) {
                req.flash(
                    'error',
                    'No password set for hidden items. Please set a password in settings first.',
                );
                const url = new URL('http://localhost' + redirect_url);
                url.searchParams.set('verify-password-modal', 'true');
                return res.redirect(url.pathname + url.search);
            }

            const isValid = await ctx.libs.bcrypt.compare(password, dbUser.hidden_items_password);

            if (!isValid) {
                if (resource_type === 'note') {
                    req.flash('error', 'Invalid password. Please try again.');
                    const url = new URL('http://localhost' + redirect_url);
                    url.searchParams.set('verify-password-modal', 'true');
                    return res.redirect(url.pathname + url.search);
                }

                if (resource_type === 'bang' && original_query) {
                    req.flash('error', 'Invalid password. Please try again.');
                    const url = new URL('http://localhost' + redirect_url);
                    url.searchParams.set('verify-password-modal', 'true');
                    return res.redirect(url.pathname + url.search);
                }

                req.flash('error', 'Invalid password. Please try again.');
                const url = new URL('http://localhost' + redirect_url);
                url.searchParams.set('verify-password-modal', 'true');

                return res.redirect(url.pathname + url.search);
            }

            req.session.verifiedHiddenItems ??= {};
            const verifiedItems: Record<string, number> = req.session.verifiedHiddenItems;

            const now = Date.now();
            for (const [key, expiry] of Object.entries(verifiedItems)) {
                if (expiry < now) {
                    delete verifiedItems[key];
                }
            }

            const verificationKey = `${resource_type || 'global'}_${resource_id || 'global'}`;
            verifiedItems[verificationKey] = now + 30 * 60 * 1000; // 30 minutes

            req.session.hiddenItemsVerified = true;
            req.session.hiddenItemsVerifiedAt = now;

            req.session.save((err) => {
                if (err) {
                    ctx.logger.error(
                        'Failed to save session after hidden items verification: %o',
                        err,
                    );
                }
            });

            const safeUrl = new URL('http://localhost' + redirect_url);
            const safePath = safeUrl.pathname.replace(/^\/+/, '/') + safeUrl.search;
            return res.redirect(safePath);
        },
    );

    return router;
}
