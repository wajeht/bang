import { createTabsRouter } from './tabs/tabs.js';
import { createAuthRouter } from './auth/auth.js';
import type { AppContext } from '../type.js';
import { createAdminRouter } from './admin/admin.js';
import { createNotesRouter } from './notes/notes.js';
import { createSearchRouter } from './search/search.js';
import { createActionsRouter } from './actions/actions.js';
import { createGeneralRouter } from './general/general.js';
import { createSettingsRouter } from './settings/settings.js';
import { createBookmarksRouter } from './bookmarks/bookmarks.js';
import { createRemindersRouter } from './reminders/reminders.js';
import { Hono } from 'hono';
import type { AppEnv } from '../http.js';

export function createRouter(ctx: AppContext) {
    const router = new Hono<AppEnv>();

    router.route('/', createAuthRouter(ctx));
    router.route('/', createAdminRouter(ctx));
    router.route('/', createSettingsRouter(ctx));
    router.route('/', createTabsRouter(ctx));
    router.route('/', createNotesRouter(ctx));
    router.route('/', createActionsRouter(ctx));
    router.route('/', createBookmarksRouter(ctx));
    router.route('/', createRemindersRouter(ctx));
    router.route('/', createSearchRouter(ctx));
    router.route('/', createGeneralRouter(ctx));

    return router;
}
