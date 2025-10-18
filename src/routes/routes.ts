import { TabsRouter } from './tabs/tabs';
import { AuthRouter } from './auth/auth';
import type { AppContext } from '../type';
import { AdminRouter } from './admin/admin';
import { NotesRouter } from './notes/notes';
import { SearchRouter } from './search/search';
import { ActionsRouter } from './actions/actions';
import { GeneralRouter } from './general/general';
import { SettingsRouter } from './settings/settings';
import { BookmarksRouter } from './bookmarks/bookmarks';
import { RemindersRouter } from './reminders/reminders';

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
    const router = ctx.libs.express.Router();

    router.use(AuthRouter(ctx));
    router.use(AdminRouter(ctx));
    router.use(SettingsRouter(ctx));
    router.use(TabsRouter(ctx));
    router.use(NotesRouter(ctx));
    router.use(ActionsRouter(ctx));
    router.use(BookmarksRouter(ctx));
    router.use(RemindersRouter(ctx));
    router.use(SearchRouter(ctx));
    router.use(GeneralRouter(ctx));

    return router;
}
