import express from 'express';
import type { AppContext } from '../context';
import { createTabsRouter } from './tabs/tabs';
import { createAuthRouter } from './auth/auth';
import { createAdminRouter } from './admin/admin';
import { createNotesRouter } from './notes/notes';
import { createSearchRouter } from './search/search';
import { createActionsRouter } from './actions/actions';
import { createGeneralRouter } from './general/general';
import { createSettingsRouter } from './settings/settings';
import { createBookmarksRouter } from './bookmarks/bookmarks';
import { createRemindersRouter } from './reminders/reminders';

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

export function router(ctx: AppContext) {
    const router = express.Router();

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
