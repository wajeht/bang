import express from 'express';
import { createTabsRouter } from './tabs';
import { createAuthRouter } from './auth';
import { createNotesRouter } from './notes';
import { createAdminRouter } from './admin';
import { createSearchRouter } from './search';
import { createActionsRouter } from './actions';
import { createGeneralRouter } from './general';
import { createSettingsRouter } from './settings';
import { createBookmarksRouter } from './bookmarks';
import { createRemindersRouter } from './reminders';
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
