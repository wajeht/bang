import express from 'express';
import { db } from '../db/db';
import { tabs } from './tabs/tabs.repo';
import { notes } from './notes/notes.repo';
import { createTabsRouter } from './tabs/tabs';
import { createAuthRouter } from './auth/auth';
import { actions } from './actions/actions.repo';
import { createAdminRouter } from './admin/admin';
import { createNotesRouter } from './notes/notes';
import { createSearchRouter } from './search/search';
import { bookmarks } from './bookmarks/bookmarks.repo';
import { reminders } from './reminders/reminders.repo';
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
