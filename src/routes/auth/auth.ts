import type { AppEnv } from '../../http.js';
import { getRequestBaseUrl, setCurrentUser, setFlash } from '../../http.js';
import type { AppContext, User } from '../../type.js';
import { Hono } from 'hono';

export function createAuthRouter(ctx: AppContext) {
    const router = new Hono<AppEnv>();

    router.get('/logout', async (c) => {
        const session = c.get('session');

        if (session.user || c.get('user')) {
            session.user = null;
            setCurrentUser(c, undefined);
            session.destroy((error) => {
                if (error) {
                    throw new ctx.errors.HttpError(500, error.message);
                }
            });
        }

        return c.redirect(`/?toast=${encodeURIComponent('✌️ see ya!')}`);
    });

    router.post('/login', ctx.middleware.turnstile, async (c) => {
        const body = c.get('body');
        const email = typeof body.email === 'string' ? body.email : '';

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
            }
        }

        const token = ctx.utils.auth.generateMagicLink({ email });
        const baseUrl = getRequestBaseUrl(c);

        void Promise.resolve().then(async () => {
            try {
                await ctx.utils.mail.sendMagicLinkEmail({ email, token, baseUrl });
            } catch (error) {
                ctx.logger.error('Failed to send magic link email', { error, email });
            }
        });

        setFlash(
            c,
            'success',
            `📧 Magic link sent to ${email}! Check your email and click the link to log in.`,
        );
        const referer = c.req.header('referer');
        if (referer) {
            try {
                const refererUrl = new URL(referer);
                const appUrl = new URL(ctx.config.app.appUrl);
                if (refererUrl.host === appUrl.host) {
                    return c.redirect(refererUrl.pathname + refererUrl.search);
                }
            } catch {}
        }
        return c.redirect('/');
    });

    router.get('/auth/magic/:token', async (c) => {
        const token = c.req.param('token') ?? '';

        const decoded = ctx.utils.auth.verifyMagicLink(token);

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

        const parsedUser = {
            ...user,
            column_preferences: ctx.utils.util.parseColumnPreferences(user.column_preferences),
        };

        const session = c.get('session');
        const redirectTo = session.redirectTo || '/actions';

        session.regenerate();
        setCurrentUser(c, parsedUser);
        session.user = parsedUser;
        session.userCachedAt = Date.now();
        setFlash(c, 'success', `🎉 Welcome ${user.username}! You're now logged in.`);
        session.save();

        return c.redirect(redirectTo);
    });

    router.post('/verify-hidden-password', ctx.middleware.authentication, async (c) => {
        const body = c.get('body');
        const { password, resource_type, resource_id, original_query } = body;
        const session = c.get('session');
        const user = session.user as User;
        const redirect_url = body.redirect_url || c.req.header('referer') || '/';
        const modalQuery = { 'verify-password-modal': 'true' };

        if (!password) {
            setFlash(c, 'error', 'Password is required');
            return c.redirect(ctx.utils.request.getSafeRedirectPath(redirect_url, modalQuery));
        }

        const dbUser = await ctx.db('users').where({ id: user.id }).first();
        if (!dbUser?.hidden_items_password) {
            setFlash(
                c,
                'error',
                'No password set for hidden items. Please set a password in settings first.',
            );
            return c.redirect(ctx.utils.request.getSafeRedirectPath(redirect_url, modalQuery));
        }

        const isValid = await ctx.libs.bcrypt.compare(password, dbUser.hidden_items_password);

        if (!isValid) {
            if (resource_type === 'note') {
                setFlash(c, 'error', 'Invalid password. Please try again.');
                return c.redirect(ctx.utils.request.getSafeRedirectPath(redirect_url, modalQuery));
            }

            if (resource_type === 'bang' && original_query) {
                setFlash(c, 'error', 'Invalid password. Please try again.');
                return c.redirect(ctx.utils.request.getSafeRedirectPath(redirect_url, modalQuery));
            }

            setFlash(c, 'error', 'Invalid password. Please try again.');
            return c.redirect(ctx.utils.request.getSafeRedirectPath(redirect_url, modalQuery));
        }

        session.verifiedHiddenItems ??= {};
        const verifiedItems: Record<string, number> = session.verifiedHiddenItems;

        const now = Date.now();
        for (const [key, expiry] of Object.entries(verifiedItems)) {
            if (expiry < now) {
                delete verifiedItems[key];
            }
        }

        const verificationKey = `${resource_type || 'global'}_${resource_id || 'global'}`;
        verifiedItems[verificationKey] = now + 30 * 60 * 1000; // 30 minutes

        session.hiddenItemsVerified = true;
        session.hiddenItemsVerifiedAt = now;

        session.save((err) => {
            if (err) {
                ctx.logger.error('Failed to save session after hidden items verification: %o', err);
            }
        });

        return c.redirect(ctx.utils.request.getSafeRedirectPath(redirect_url));
    });

    return router;
}
