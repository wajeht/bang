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

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

export function createRouter(ctx: AppContext) {
    const router = ctx.libs.express.Router();

    router.use(createAuthRouter(ctx));
    router.use(createAdminRouter(ctx));
    router.use(createSettingsRouter(ctx));
    router.use(createTabsRouter(ctx));
    router.use(createNotesRouter(ctx));
    router.use(createActionsRouter(ctx));
    router.use(createBookmarksRouter(ctx));
    router.use(createRemindersRouter(ctx));
    router.use(createSearchRouter(ctx));
    router.use(createGeneralRouter(ctx));

    return router;
}
