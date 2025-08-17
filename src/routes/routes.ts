import express from 'express';
import { createTabsRouter } from './tabs/tabs';
import { createAuthRouter } from './auth/auth';
import { createNotesRouter } from './notes/notes';
import { createAdminRouter } from './admin/admin';
import { createSearchRouter } from './search/search';
import { createActionsRouter } from './actions/actions';
import { createGeneralRouter } from './general/general';
import { createSettingsRouter } from './settings/settings';
import { createBookmarksRouter } from './bookmarks/bookmarks';
import { createRemindersRouter } from './reminders/reminders';
import { db, actions, bookmarks, notes, tabs, reminders } from '../db/db';

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     BearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 */

const router = express.Router();

router.use(createAuthRouter(db));
router.use(createAdminRouter(db));
router.use(createSettingsRouter(db));
router.use(createTabsRouter(db, tabs));
router.use(createNotesRouter(notes));
router.use(createActionsRouter(db, actions));
router.use(createBookmarksRouter(db, bookmarks));
router.use(createRemindersRouter(db, reminders));
router.use(createSearchRouter(actions, bookmarks, notes, reminders, tabs));
router.use(createGeneralRouter(db, actions, bookmarks, notes, tabs, reminders));

export { router };
