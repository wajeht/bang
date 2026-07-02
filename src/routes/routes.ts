import { createTabsRouter } from './tabs/tabs.js';
import { createAuthRouter } from './auth/auth.js';
import type { AppContext } from '../type.js';
import { createAdminRouter } from './admin/admin.js';
import { createNotesExpressRouter, createNotesRouter } from './notes/notes.js';
import { createSearchRouter } from './search/search.js';
import { createActionsRouter } from './actions/actions.js';
import { createGeneralExpressRouter, createGeneralRouter } from './general/general.js';
import { createSettingsExpressRouter, createSettingsRouter } from './settings/settings.js';
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
    const generalRouter = createGeneralRouter(ctx);
    const settingsRouter = createSettingsRouter(ctx);
    const notesRouter = createNotesRouter(ctx);

    router.get('/healthz', createHonoRequestHandler(generalRouter.fetch));
    router.get(
        '/metrics',
        ctx.middleware.authentication,
        ctx.middleware.adminOnly,
        createHonoRequestHandler(generalRouter.fetch),
    );
    router.get(
        '/api/collections',
        ctx.middleware.authentication,
        createHonoRequestHandler(generalRouter.fetch),
    );
    router.get(
        '/api/settings/api-key',
        ctx.middleware.authentication,
        createHonoRequestHandler(settingsRouter.fetch),
    );
    router.post(
        '/api/notes/render-markdown',
        ctx.middleware.authentication,
        createHonoRequestHandler(notesRouter.fetch),
    );

    router.use(createAuthRouter(ctx));
    router.use(createAdminRouter(ctx));
    router.use(createSettingsExpressRouter(ctx));
    router.use(createTabsRouter(ctx));
    router.use(createNotesExpressRouter(ctx));
    router.use(createActionsRouter(ctx));
    router.use(createBookmarksRouter(ctx));
    router.use(createRemindersRouter(ctx));
    router.use(createSearchRouter(ctx));
    router.use(createGeneralExpressRouter(ctx));

    return router;
}
