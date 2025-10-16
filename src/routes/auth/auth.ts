import bcrypt from 'bcrypt';
import express from 'express';
import { User } from '../../type';
import type { AppContext } from '../../context';
import type { Request, Response } from 'express';
import { sendMagicLinkEmail } from '../../utils/mail';
import { HttpError, ValidationError } from '../../error';
import { isValidEmail, magicLink } from '../../utils/util';
import { authenticationMiddleware, turnstileMiddleware } from '../middleware';

export function createAuthRouter(context: AppContext) {
    const router = express.Router();

    router.get('/logout', async (req: Request, res: Response) => {
        if ((req.session && req.session.user) || req.user) {
            req.session.user = null;
            req.user = undefined;
            req.session.destroy((error) => {
                if (error) {
                    throw new HttpError(500, error.message, req);
                }
            });
        }

        return res.redirect(`/?toast=${encodeURIComponent('✌️ see ya!')}`);
    });

    router.post('/login', turnstileMiddleware, async (req: Request, res: Response) => {
        const { email } = req.body;

        if (!email) {
            throw new ValidationError({ email: 'Email is required' });
        }

        if (!isValidEmail(email)) {
            throw new ValidationError({ email: 'Please enter a valid email address' });
        }

        let user = await context.db('users').where({ email }).first();

        if (user) {
            user.is_admin = Boolean(user.is_admin);
            user.autocomplete_search_on_homepage = Boolean(user.autocomplete_search_on_homepage);
        }

        if (!user) {
            const username = email.split('@')[0];
            [user] = await context
                .db('users')
                .insert({
                    username,
                    email,
                    is_admin: context.config.app.adminEmail === email,
                })
                .returning('*');

            if (user) {
                user.is_admin = Boolean(user.is_admin);
                user.autocomplete_search_on_homepage = Boolean(
                    user.autocomplete_search_on_homepage,
                );
            }
        }

        const token = magicLink.generate({ email });

        setTimeout(() => sendMagicLinkEmail({ email, token, req }), 0);

        req.flash(
            'success',
            `📧 Magic link sent to ${email}! Check your email and click the link to log in.`,
        );
        return res.redirect(req.headers.referer || '/');
    });

    router.get('/auth/magic/:token', async (req: Request, res: Response) => {
        const { token } = req.params;

        const decoded = magicLink.verify(token!);

        if (!decoded || !decoded.email) {
            throw new ValidationError({
                email: 'Magic link has expired or is invalid. Please request a new one.',
            });
        }

        const user = await context.db('users').where({ email: decoded.email }).first();

        if (user) {
            user.is_admin = Boolean(user.is_admin);
            user.autocomplete_search_on_homepage = Boolean(user.autocomplete_search_on_homepage);
        }

        if (!user) {
            throw new ValidationError({ email: 'User not found' });
        }

        await context
            .db('users')
            .where({ id: user.id })
            .update({ email_verified_at: context.db.fn.now() });

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

        req.user = parsedUser;
        req.session.user = parsedUser;

        const redirectTo = req.session.redirectTo || '/actions';
        delete req.session.redirectTo;
        req.session.save();

        req.flash('success', `🎉 Welcome ${user.username}! You're now logged in.`);
        return res.redirect(redirectTo);
    });

    router.post(
        '/verify-hidden-password',
        authenticationMiddleware,
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

            if (!user.hidden_items_password) {
                req.flash(
                    'error',
                    'No password set for hidden items. Please set a password in settings first.',
                );
                const url = new URL('http://localhost' + redirect_url);
                url.searchParams.set('verify-password-modal', 'true');
                return res.redirect(url.pathname + url.search);
            }

            const isValid = await bcrypt.compare(password, user.hidden_items_password);

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

            if (!req.session.verifiedHiddenItems) {
                req.session.verifiedHiddenItems = {};
            }

            const verificationKey = `${resource_type || 'global'}_${resource_id || 'global'}`;
            req.session.verifiedHiddenItems[verificationKey] = Date.now() + 30 * 60 * 1000; // 30 minutes

            req.session.hiddenItemsVerified = true;
            req.session.hiddenItemsVerifiedAt = Date.now();

            return res.redirect(redirect_url);
        },
    );

    return router;
}
