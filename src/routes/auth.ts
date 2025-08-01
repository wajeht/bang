import express, { Request, Response } from 'express';
import { Knex } from 'knex';
import { Actions, Bookmarks, Notes, Reminders, Tabs, User } from '../type';
import { isValidEmail, magicLink, sendMagicLinkEmail, extractPagination } from '../utils/util';
import { ValidationError, HttpError } from '../error';
import { config } from '../config';

export function createAuthRoutes(
    actions: Actions,
    bookmarks: Bookmarks,
    notes: Notes,
    reminders: Reminders,
    tabs: Tabs,
    db: Knex,
) {
    const router = express.Router();

    router.get('/logout', (req: Request, res: Response) => {
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

    router.post('/login', async (req: Request, res: Response) => {
        const { email } = req.body;

        if (!email) {
            throw new ValidationError({ email: 'Email is required' });
        }

        if (!isValidEmail(email)) {
            throw new ValidationError({ email: 'Please enter a valid email address' });
        }

        let user = await db('users').where({ email }).first();

        if (!user) {
            const username = email.split('@')[0];
            [user] = await db('users')
                .insert({
                    username,
                    email,
                    is_admin: config.app.adminEmail === email,
                })
                .returning('*');
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

    router.get('/search', async (req: Request, res: Response) => {
        const user = req.user as User;
        const searchQuery = req.query.q?.toString().trim() || '';
        const searchType = req.query.type?.toString() || 'global';

        if (!searchQuery) {
            return res.render('./search/search-results.html', {
                user: req.session?.user,
                title: 'Global Search',
                path: '/search',
                layout: '../layouts/auth.html',
                searchQuery: '',
                searchType,
                results: {
                    bookmarks: { data: [], pagination: {} },
                    actions: { data: [], pagination: {} },
                    notes: { data: [], pagination: {} },
                    tabs: [],
                    reminders: { data: [], pagination: {} },
                },
            });
        }

        if (searchType !== 'global') {
            return res.render('./search/search-results.html', {
                user: req.session?.user,
                title: 'Global Search',
                path: '/search',
                layout: '../layouts/auth.html',
                searchQuery,
                searchType,
                results: {
                    bookmarks: { data: [], pagination: {} },
                    actions: { data: [], pagination: {} },
                    notes: { data: [], pagination: {} },
                    tabs: [],
                    reminders: { data: [], pagination: {} },
                },
            });
        }

        const [bookmarksResult, actionsResult, notesResult, tabsResult, remindersResult] =
            await Promise.all([
                // Search bookmarks
                bookmarks.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    highlight: true,
                }),
                // Search actions
                actions.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    highlight: true,
                }),
                // Search notes
                notes.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    highlight: true,
                }),
                // Search tabs
                tabs.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    highlight: true,
                }),
                // Search reminders
                reminders.all({
                    user,
                    perPage: 999999,
                    page: 1,
                    search: searchQuery,
                    sortKey: 'created_at',
                    direction: 'desc',
                    highlight: true,
                }),
            ]);

        return res.render('./search/search-results.html', {
            user: req.session?.user,
            title: 'Global Search',
            path: '/search',
            layout: '../layouts/auth.html',
            searchQuery,
            searchType,
            results: {
                bookmarks: bookmarksResult,
                actions: actionsResult,
                notes: notesResult,
                tabs: tabsResult.data,
                reminders: remindersResult,
            },
        });
    });

    return router;
}
