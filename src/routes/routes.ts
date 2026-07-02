import { createTabsRouter } from './tabs/tabs.js';
import { createAuthRouter } from './auth/auth.js';
import type { AppContext } from '../type.js';
import { createAdminRouter } from './admin/admin.js';
import { createNotesNativeRouter, createNotesRouter } from './notes/notes.js';
import { createSearchRouter } from './search/search.js';
import { createActionsRouter } from './actions/actions.js';
import { createGeneralNativeRouter, createGeneralRouter } from './general/general.js';
import { createSettingsNativeRouter, createSettingsRouter } from './settings/settings.js';
import { createBookmarksRouter } from './bookmarks/bookmarks.js';
import { createRemindersRouter } from './reminders/reminders.js';
import { createHonoRequestHandler } from './hono/express-adapter.js';

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
    const generalNativeRouter = createGeneralNativeRouter(ctx);
    const settingsNativeRouter = createSettingsNativeRouter(ctx);
    const notesNativeRouter = createNotesNativeRouter(ctx);

    router.get('/healthz', createHonoRequestHandler(generalNativeRouter.fetch));
    router.get(
        '/metrics',
        ctx.middleware.authentication,
        ctx.middleware.adminOnly,
        createHonoRequestHandler(generalNativeRouter.fetch),
    );
    router.get(
        '/api/collections',
        ctx.middleware.authentication,
        createHonoRequestHandler(generalNativeRouter.fetch),
    );
    router.get(
        '/api/settings/api-key',
        ctx.middleware.authentication,
        createHonoRequestHandler(settingsNativeRouter.fetch),
    );
    router.post(
        '/api/notes/render-markdown',
        ctx.middleware.authentication,
        createHonoRequestHandler(notesNativeRouter.fetch),
    );

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
