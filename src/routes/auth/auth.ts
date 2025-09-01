import bcrypt from 'bcrypt';
import express from 'express';
import type { Knex } from 'knex';
import { User } from '../../type';
import { config } from '../../config';
import type { Request, Response } from 'express';
import { sendMagicLinkEmail } from '../../utils/mail';
import { HttpError, ValidationError } from '../../error';
import { isValidEmail, magicLink } from '../../utils/util';
import { authenticationMiddleware, turnstileMiddleware } from '../middleware';

export function createAuthRouter(db: Knex) {
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

        let user = await db('users').where({ email }).first();

        if (user) {
            user.is_admin = Boolean(user.is_admin);
            user.autocomplete_search_on_homepage = Boolean(user.autocomplete_search_on_homepage);
        }

        if (!user) {
            const username = email.split('@')[0];
            [user] = await db('users')
                .insert({
                    username,
                    email,
                    is_admin: config.app.adminEmail === email,
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

        const user = await db('users').where({ email: decoded.email }).first();

        if (user) {
            user.is_admin = Boolean(user.is_admin);
            user.autocomplete_search_on_homepage = Boolean(user.autocomplete_search_on_homepage);
        }

        if (!user) {
            throw new ValidationError({ email: 'User not found' });
        }

        await db('users').where({ id: user.id }).update({ email_verified_at: db.fn.now() });

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
            const { password, resource_type, resource_id, redirect_url, original_query } = req.body;
            const user = req.session.user as User;

            if (!password) {
                return res.set({ 'Content-Type': 'text/html' }).status(422).send(`
                <script>
                    alert("Password is required");
                    window.history.back();
                </script>
            `);
            }

            if (!user.hidden_items_password) {
                return res.set({ 'Content-Type': 'text/html' }).status(422).send(`
                <script>
                    alert("No password set for hidden items. Please set a password in settings first.");
                    window.history.back();
                </script>
            `);
            }

            const isValid = await bcrypt.compare(password, user.hidden_items_password);

            if (!isValid) {
                if (resource_type === 'note') {
                    return res.set({ 'Content-Type': 'text/html' }).status(401).send(`
                    <script>
                        alert("Invalid password. Please try again.");
                        window.location.href = '${redirect_url}';
                    </script>
                `);
                }

                if (resource_type === 'bang' && original_query) {
                    return res.set({ 'Content-Type': 'text/html' }).status(401).send(`
                    <script>
                        alert("Invalid password. Please try again.");
                        window.location.href = '/${original_query}';
                    </script>
                `);
                }

                return res.set({ 'Content-Type': 'text/html' }).status(401).send(`
                <script>
                    alert("Invalid password. Please try again.");
                    window.history.back();
                </script>
            `);
            }

            if (!req.session.verifiedHiddenItems) {
                req.session.verifiedHiddenItems = {};
            }

            const verificationKey = `${resource_type}_${resource_id}`;
            req.session.verifiedHiddenItems[verificationKey] = Date.now() + 30 * 60 * 1000; // 30 minutes

            return res.redirect(redirect_url);
        },
    );

    return router;
}
