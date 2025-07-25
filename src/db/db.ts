import {
    Note,
    Action,
    Bookmark,
    Reminder,
    NotesQueryParams,
    ActionsQueryParams,
    BookmarksQueryParams,
    RemindersQueryParams,
} from '../type';
import knex from 'knex';
import path from 'node:path';
import { config } from '../config';
import knexConfig from './knexfile';
import { logger } from '../utils/logger';
import { attachPaginate } from './paginate';
import { sqlHighlight } from '../utils/util';
import type { Actions, Bookmarks, Notes, Reminders } from '../type';

function _createKnexInstance() {
    const db = knex(knexConfig);
    attachPaginate();
    return db;
}

export const db = _createKnexInstance();

export async function optimizeDatabase() {
    try {
        // Update query planner statistics
        await db.raw('ANALYZE');

        // Optimize query planner
        await db.raw('PRAGMA optimize');

        // Vacuum database (non-production only)
        if (config.app.env !== 'production') {
            await db.raw('VACUUM');
        }

        logger.info('Database optimization completed');
    } catch (error) {
        logger.error(`Error optimizing database: %o`, { error });
    }
}

export async function checkDatabaseHealth() {
    try {
        const [walMode] = await db.raw('PRAGMA journal_mode');
        const [cacheSize] = await db.raw('PRAGMA cache_size');
        const [busyTimeout] = await db.raw('PRAGMA busy_timeout');
        const [threads] = await db.raw('PRAGMA threads');
        const [mmapSize] = await db.raw('PRAGMA mmap_size');
        const [syncMode] = await db.raw('PRAGMA synchronous');

        const healthInfo = {
            journalMode: walMode.journal_mode || walMode,
            cacheSize: cacheSize.cache_size || cacheSize,
            busyTimeout: busyTimeout.timeout || busyTimeout,
            threads: threads.threads || threads,
            mmapSize: `${Math.round((mmapSize.mmap_size || mmapSize) / 1024 / 1024)}MB`,
            synchronous:
                (syncMode.synchronous || syncMode) === 1
                    ? 'NORMAL'
                    : (syncMode.synchronous || syncMode) === 0
                      ? 'OFF'
                      : 'FULL',
        };

        logger.info(`Database health check: %o`, { healthInfo });

        return true;
    } catch (error) {
        logger.error(`Database health check failed: %o`, { error });
        return false;
    }
}

export async function runProdMigration(force: boolean = false) {
    try {
        if (config.app.env !== 'production' && force !== true) {
            logger.info('cannot run auto database migration on non production');
            return;
        }

        const dbConfig = {
            directory: path.resolve(path.join(process.cwd(), 'dist', 'src', 'db', 'migrations')),
        };

        if (config.app.env !== 'production') {
            dbConfig.directory = path.resolve(path.join(process.cwd(), 'src', 'db', 'migrations'));
        }

        const version = await db.migrate.currentVersion();
        logger.info(`current database version ${version}`);

        logger.info('checking for database upgrades');
        logger.info(`looking for migrations in: ${dbConfig.directory}`);

        const [batchNo, migrations] = await db.migrate.latest(dbConfig);

        if (migrations.length === 0) {
            logger.info('database upgrade not required');
            return;
        }

        migrations.forEach((migration: string) => {
            logger.info(`running migration file: ${migration}`);
        });

        const migrationList = migrations
            .map((migration: string) => migration.split('_')[1]?.split('.')[0] ?? '')
            .join(', ');

        logger.info(`database upgrades completed for ${migrationList} schema`);
        logger.info(`batch ${batchNo} run: ${migrations.length} migrations`);
    } catch (error) {
        logger.error(`error running migrations: %o`, { error });
        throw error;
    }
}

export const actions: Actions = {
    all: async ({
        user,
        perPage = 10,
        page = 1,
        search = '',
        sortKey = 'created_at',
        direction = 'desc',
        highlight = false,
    }: ActionsQueryParams) => {
        const query = db.select(
            'bangs.id',
            'bangs.user_id',
            'bangs.action_type_id',
            'bangs.created_at',
            'bangs.updated_at',
            'bangs.last_read_at',
            'bangs.usage_count',
        );

        if (highlight && search) {
            query
                .select(db.raw(`${sqlHighlight('bangs.name', search)} as name`))
                .select(db.raw(`${sqlHighlight('bangs.trigger', search)} as trigger`))
                .select(db.raw(`${sqlHighlight('bangs.url', search)} as url`))
                .select(db.raw(`${sqlHighlight('action_types.name', search)} as action_type`));
        } else {
            query
                .select('bangs.name')
                .select('bangs.trigger')
                .select('bangs.url')
                .select('action_types.name as action_type');
        }

        query
            .from('bangs')
            .join('action_types', 'bangs.action_type_id', 'action_types.id')
            .where('bangs.user_id', user.id);

        if (search) {
            const searchTerms = search
                .toLowerCase()
                .trim()
                .split(/\s+/)
                .filter((term) => term.length > 0)
                .map((term) => term.replace(/[%_]/g, '\\$&'));

            query.where((q) => {
                // Each term must match name, trigger, or url
                searchTerms.forEach((term) => {
                    q.andWhere((subQ) => {
                        subQ.whereRaw('LOWER(bangs.name) LIKE ?', [`%${term}%`])
                            .orWhereRaw('LOWER(bangs.trigger) LIKE ?', [`%${term}%`])
                            .orWhereRaw('LOWER(bangs.url) LIKE ?', [`%${term}%`]);
                    });
                });
            });
        }

        if (
            [
                'name',
                'trigger',
                'url',
                'created_at',
                'action_type',
                'last_read_at',
                'usage_count',
            ].includes(sortKey)
        ) {
            if (sortKey === 'action_type') {
                query.orderBy('action_types.name', direction);
            } else {
                query.orderBy(`bangs.${sortKey}`, direction);
            }
        } else {
            query.orderBy('bangs.created_at', 'desc');
        }

        return query.paginate({ perPage, currentPage: page, isLengthAware: true });
    },

    create: async (action: Action & { actionType: string }) => {
        if (
            !action.name ||
            !action.trigger ||
            !action.url ||
            !action.actionType ||
            !action.user_id
        ) {
            throw new Error('Missing required fields to create an action');
        }

        const actionTypeRecord = await db('action_types')
            .where({ name: action.actionType })
            .first();

        if (!actionTypeRecord) {
            throw new Error('Invalid action type');
        }

        action.action_type_id = actionTypeRecord.id;

        const { actionType: _actionType, ...rest } = action;

        const [createdAction] = await db('bangs').insert(rest).returning('*');
        return createdAction;
    },

    read: async (id: number, userId: number) => {
        const action = await db
            .select(
                'bangs.id',
                'bangs.name',
                'bangs.trigger',
                'bangs.url',
                'action_types.name as action_type',
                'bangs.created_at',
                'bangs.last_read_at',
            )
            .from('bangs')
            .join('action_types', 'bangs.action_type_id', 'action_types.id')
            .where({ 'bangs.id': id, 'bangs.user_id': userId })
            .first();

        if (!action) {
            return null;
        }

        return action;
    },
    update: async (
        id: number,
        userId: number,
        updates: Partial<Action> & { actionType: string },
    ) => {
        const allowedFields = ['name', 'trigger', 'url', 'actionType'];

        const updateData = Object.fromEntries(
            Object.entries(updates).filter(([key]) => allowedFields.includes(key)),
        );

        if (Object.keys(updateData).length === 0) {
            throw new Error('No valid fields provided for update');
        }

        const actionTypeRecord = await db('action_types')
            .where({ name: updates.actionType })
            .first();

        if (!actionTypeRecord) {
            throw new Error('Invalid action type');
        }

        updateData.action_type_id = actionTypeRecord.id;

        const { actionType: _actionType, ...rest } = updateData;

        const [updatedAction] = await db('bangs')
            .where({ id, user_id: userId })
            .update(rest)
            .returning('*');

        if (!updatedAction) {
            return null;
        }

        return updatedAction;
    },

    delete: async (id: number, userId: number) => {
        const rowsAffected = await db('bangs').where({ id, user_id: userId }).delete();
        return rowsAffected > 0;
    },
};

export const bookmarks: Bookmarks = {
    all: async ({
        user,
        perPage = 10,
        page = 1,
        search = '',
        sortKey = 'created_at',
        direction = 'desc',
        highlight = false,
    }: BookmarksQueryParams) => {
        const query = db.select('id', 'user_id', 'pinned', 'created_at', 'updated_at');

        if (highlight && search) {
            query
                .select(db.raw(`${sqlHighlight('title', search)} as title`))
                .select(db.raw(`${sqlHighlight('url', search)} as url`));
        } else {
            query.select('title').select('url');
        }

        query.from('bookmarks').where('user_id', user.id);

        if (search) {
            const searchTerms = search
                .toLowerCase()
                .trim()
                .split(/\s+/) // Split on whitespace
                .filter((term) => term.length > 0)
                .map((term) => term.replace(/[%_]/g, '\\$&')); // Escape LIKE special chars

            query.where((q) => {
                // Each term must match either title or url
                searchTerms.forEach((term) => {
                    q.andWhere((subQ) => {
                        subQ.whereRaw('LOWER(title) LIKE ?', [`%${term}%`]).orWhereRaw(
                            'LOWER(url) LIKE ?',
                            [`%${term}%`],
                        );
                    });
                });
            });
        }

        // Always sort by pinned first (pinned bookmarks at top), then by the requested sort
        query.orderBy('pinned', 'desc');

        if (['title', 'url', 'created_at', 'pinned'].includes(sortKey)) {
            query.orderBy(sortKey, direction);
        } else {
            query.orderBy('created_at', 'desc');
        }

        return query.paginate({ perPage, currentPage: page, isLengthAware: true });
    },

    create: async (bookmark: Bookmark) => {
        if (!bookmark.title || !bookmark.url || !bookmark.user_id) {
            throw new Error('Missing required fields to create a bookmark');
        }

        const [createdBookmark] = await db('bookmarks').insert(bookmark).returning('*');
        return createdBookmark;
    },

    read: async (id: number, userId: number) => {
        const bookmark = await db
            .select('*')
            .from('bookmarks')
            .where({ id, user_id: userId })
            .first();

        if (!bookmark) {
            return null;
        }

        return bookmark;
    },

    update: async (id: number, userId: number, updates: Partial<Bookmark>) => {
        const allowedFields = ['title', 'url', 'pinned'];

        const updateData = Object.fromEntries(
            Object.entries(updates).filter(([key]) => allowedFields.includes(key)),
        );

        if (Object.keys(updateData).length === 0) {
            throw new Error('No valid fields provided for update');
        }

        const [updatedBookmark] = await db('bookmarks')
            .where({ id, user_id: userId })
            .update(updateData)
            .returning('*');

        if (!updatedBookmark) {
            return null;
        }

        return updatedBookmark;
    },

    delete: async (id: number, userId: number) => {
        const rowsAffected = await db('bookmarks').where({ id, user_id: userId }).delete();
        return rowsAffected > 0;
    },
};

export const notes: Notes = {
    all: async ({
        user,
        perPage = 10,
        page = 1,
        search = '',
        sortKey = 'created_at',
        direction = 'desc',
        highlight = false,
    }: NotesQueryParams) => {
        const query = db.select('id', 'user_id', 'pinned', 'created_at', 'updated_at');

        if (highlight && search) {
            query
                .select(db.raw(`${sqlHighlight('title', search)} as title`))
                .select(db.raw(`${sqlHighlight('content', search)} as content`));
        } else {
            query.select('title').select('content');
        }

        query.from('notes').where('user_id', user.id);

        if (search) {
            const searchTerms = search
                .toLowerCase()
                .trim()
                .split(/\s+/)
                .filter((term) => term.length > 0)
                .map((term) => term.replace(/[%_]/g, '\\$&'));

            query.where((q) => {
                // Each term must match either title or content
                searchTerms.forEach((term) => {
                    q.andWhere((subQ) => {
                        subQ.whereRaw('LOWER(title) LIKE ?', [`%${term}%`]).orWhereRaw(
                            'LOWER(content) LIKE ?',
                            [`%${term}%`],
                        );
                    });
                });
            });
        }

        // Always sort by pinned first (pinned notes at top), then by the requested sort
        query.orderBy('pinned', 'desc');

        if (['title', 'content', 'created_at', 'pinned'].includes(sortKey)) {
            query.orderBy(sortKey, direction);
        } else {
            query.orderBy('created_at', 'desc');
        }

        return query.paginate({ perPage, currentPage: page, isLengthAware: true });
    },

    create: async (note: Note) => {
        if (!note.title || !note.content || !note.user_id) {
            throw new Error('Missing required fields to create a note');
        }

        const [createdNote] = await db('notes').insert(note).returning('*');
        return createdNote;
    },

    read: async (id: number, userId: number) => {
        const note = await db.select('*').from('notes').where({ id, user_id: userId }).first();

        if (!note) {
            return null;
        }

        return note;
    },

    update: async (id: number, userId: number, updates: Partial<Note>) => {
        const allowedFields = ['title', 'content', 'pinned'];

        const updateData = Object.fromEntries(
            Object.entries(updates).filter(([key]) => allowedFields.includes(key)),
        );

        if (Object.keys(updateData).length === 0) {
            throw new Error('No valid fields provided for update');
        }

        const [updatedNote] = await db('notes')
            .where({ id, user_id: userId })
            .update(updateData)
            .returning('*');

        if (!updatedNote) {
            return null;
        }

        return updatedNote;
    },

    delete: async (id: number, userId: number) => {
        const rowsAffected = await db('notes').where({ id, user_id: userId }).delete();
        return rowsAffected > 0;
    },
};

export const users = {
    read: async (id: number) => {
        try {
            return await db('users').where({ id }).first();
        } catch {
            return null;
        }
    },
    readByEmail: async (email: string) => {
        try {
            return await db('users').where({ email }).first();
        } catch {
            return null;
        }
    },
};

export const reminders: Reminders = {
    all: async ({
        user,
        perPage = 20,
        page = 1,
        search = '',
        sortKey = 'next_due',
        direction = 'asc',
        highlight = false,
    }: RemindersQueryParams) => {
        const query = db.select(
            'id',
            'user_id',
            'reminder_type',
            'frequency',
            'is_completed',
            'created_at',
            'updated_at',
        );

        if (highlight && search) {
            query
                .select(db.raw(`${sqlHighlight('title', search)} as title`))
                .select(db.raw(`${sqlHighlight('content', search)} as content`))
                .select(db.raw(`${sqlHighlight('CAST(next_due AS TEXT)', search)} as next_due`));
        } else {
            query.select('title').select('content').select('next_due');
        }

        query.from('reminders').where('user_id', user.id);

        if (search) {
            const searchTerms = search
                .toLowerCase()
                .trim()
                .split(/\s+/)
                .filter((term) => term.length > 0)
                .map((term) => term.replace(/[%_]/g, '\\$&'));

            query.where((q) => {
                // Each term must match title, content, or frequency
                searchTerms.forEach((term) => {
                    q.andWhere((subQ) => {
                        subQ.whereRaw('LOWER(title) LIKE ?', [`%${term}%`])
                            .orWhereRaw('LOWER(content) LIKE ?', [`%${term}%`])
                            .orWhereRaw('LOWER(frequency) LIKE ?', [`%${term}%`]);
                    });
                });
            });
        }

        // Sort by completion status first (incomplete reminders at top)
        query.orderBy('is_completed', 'asc');

        if (['title', 'content', 'next_due', 'frequency', 'created_at'].includes(sortKey)) {
            query.orderBy(sortKey, direction);
        } else {
            query.orderBy('next_due', 'asc');
        }

        return query.paginate({ perPage, currentPage: page, isLengthAware: true });
    },

    create: async (reminder: Reminder) => {
        if (!reminder.title || !reminder.user_id || !reminder.reminder_type) {
            throw new Error('Missing required fields to create a reminder');
        }

        const [createdReminder] = await db('reminders').insert(reminder).returning('*');
        return createdReminder;
    },

    read: async (id: number, userId: number) => {
        const reminder = await db
            .select('*')
            .from('reminders')
            .where({ id, user_id: userId })
            .first();

        if (!reminder) {
            return null;
        }

        return reminder;
    },

    update: async (id: number, userId: number, updates: Partial<Reminder>) => {
        const allowedFields = [
            'title',
            'content',
            'reminder_type',
            'frequency',
            'next_due',
            'is_completed',
        ];

        const updateData = Object.fromEntries(
            Object.entries(updates).filter(([key]) => allowedFields.includes(key)),
        );

        if (Object.keys(updateData).length === 0) {
            throw new Error('No valid fields provided for update');
        }

        const [updatedReminder] = await db('reminders')
            .where({ id, user_id: userId })
            .update(updateData)
            .returning('*');

        if (!updatedReminder) {
            return null;
        }

        return updatedReminder;
    },

    delete: async (id: number, userId: number) => {
        const rowsAffected = await db('reminders').where({ id, user_id: userId }).delete();
        return rowsAffected > 0;
    },

    complete: async (id: number, userId: number) => {
        const reminder = await db('reminders').where({ id, user_id: userId }).first();

        if (!reminder) {
            throw new Error('Reminder not found');
        }

        // Calculate next due date for recurring reminders
        let nextDue = reminder.next_due;
        if (reminder.reminder_type === 'recurring' && !reminder.is_completed) {
            const currentDue = new Date(reminder.next_due);
            switch (reminder.frequency) {
                case 'daily':
                    currentDue.setDate(currentDue.getDate() + 1);
                    break;
                case 'weekly':
                    currentDue.setDate(currentDue.getDate() + 7);
                    break;
                case 'biweekly':
                    currentDue.setDate(currentDue.getDate() + 14);
                    break;
                case 'monthly':
                    currentDue.setMonth(currentDue.getMonth() + 1);
                    break;
            }
            nextDue = currentDue;
        }

        const [updatedReminder] = await db('reminders')
            .where({ id, user_id: userId })
            .update({
                is_completed: !reminder.is_completed,
                next_due: nextDue,
            })
            .returning('*');

        return updatedReminder;
    },
};
