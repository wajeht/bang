import express from 'express';

import { createPublicRoutes } from './routes/public';
import { createAuthRoutes } from './routes/auth';
import { createAdminRoutes } from './routes/admin';
import { createSettingsRoutes } from './routes/settings';
import { createCollectionsRoutes } from './routes/collections';
import { createTabs } from './routes/tabs';
import { createActions } from './routes/actions';
import { createBookmarks } from './routes/bookmarks';
import { createNotes } from './routes/notes';
import { createReminders } from './routes/reminders';

import { api } from './utils/util';
import { search } from './utils/search';
import { db, actions, bookmarks, notes, reminders, tabs } from './db/db';
import { adminOnlyMiddleware, authenticationMiddleware, turnstileMiddleware } from './middleware';

export function createRouter(ctx) {
    const router = express.Router();

    router.use('/', createPublicRoutes(search, db));
    router.use('/', createAuthRoutes(actions, bookmarks, notes, reminders, tabs, db));

    router.use(authenticationMiddleware, createNotes(notes));
    router.use(authenticationMiddleware, createTabs(tabs, db));
    router.use(authenticationMiddleware, createActions(actions, db));
    router.use(authenticationMiddleware, createReminders(reminders));
    router.use(authenticationMiddleware, createSettingsRoutes(db, api));
    router.use(authenticationMiddleware, createBookmarks(bookmarks, db));
    router.use(authenticationMiddleware, createCollectionsRoutes(actions, bookmarks, notes, tabs, reminders)); // prettier-ignore

    router.use(authenticationMiddleware, adminOnlyMiddleware, createAdminRoutes(db));

    return router;
}
