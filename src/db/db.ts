import {
    Tab,
    Note,
    Action,
    Bookmark,
    Reminder,
    TabsQueryParams,
    NotesQueryParams,
    ActionsQueryParams,
    RemindersQueryParams,
    BookmarksQueryParams,
} from '../type';
import knex from 'knex';
import path from 'node:path';
import { config } from '../config';
import knexConfig from './knexfile';
import { logger } from '../utils/logger';
import { attachPaginate } from './paginate';
import { sqlHighlight } from '../utils/util';
import type { Actions, Bookmarks, Notes, Reminders, Tabs } from '../type';

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
            'bangs.action_type',
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
                .select(db.raw(`${sqlHighlight('bangs.action_type', search)} as action_type`));
        } else {
            query
                .select('bangs.name')
                .select('bangs.trigger')
                .select('bangs.url')
                .select('bangs.action_type');
        }

        query.from('bangs').where('bangs.user_id', user.id);

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
            query.orderBy(`bangs.${sortKey}`, direction);
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

        if (!['search', 'redirect'].includes(action.actionType)) {
            throw new Error('Invalid action type');
        }

        const { actionType, ...rest } = action;
        const actionData = { ...rest, action_type: actionType };

        const [createdAction] = await db('bangs').insert(actionData).returning('*');
        return createdAction;
    },

    read: async (id: number, userId: number) => {
        const action = await db
            .select(
                'bangs.id',
                'bangs.name',
                'bangs.trigger',
                'bangs.url',
                'bangs.action_type',
                'bangs.created_at',
                'bangs.last_read_at',
            )
            .from('bangs')
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

        if (!['search', 'redirect'].includes(updates.actionType)) {
            throw new Error('Invalid action type');
        }

        updateData.action_type = updates.actionType;

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
            const user = await db('users').where({ id }).first();
            if (user) {
                // Convert SQLite integer values to booleans
                user.is_admin = Boolean(user.is_admin);
                user.autocomplete_search_on_homepage = Boolean(
                    user.autocomplete_search_on_homepage,
                );
            }
            return user;
        } catch {
            return null;
        }
    },
    readByEmail: async (email: string) => {
        try {
            const user = await db('users').where({ email }).first();
            if (user) {
                // Convert SQLite integer values to booleans
                user.is_admin = Boolean(user.is_admin);
                user.autocomplete_search_on_homepage = Boolean(
                    user.autocomplete_search_on_homepage,
                );
            }
            return user;
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
        sortKey = 'due_date',
        direction = 'asc',
        highlight = false,
    }: RemindersQueryParams) => {
        const query = db.select(
            'id',
            'user_id',
            'reminder_type',
            'frequency',
            'created_at',
            'updated_at',
        );

        if (highlight && search) {
            query
                .select(db.raw(`${sqlHighlight('title', search)} as title`))
                .select(db.raw(`${sqlHighlight('content', search)} as content`))
                .select(db.raw(`${sqlHighlight('CAST(due_date AS TEXT)', search)} as due_date`));
        } else {
            query.select('title').select('content').select('due_date');
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

        if (['title', 'content', 'due_date', 'frequency', 'created_at'].includes(sortKey)) {
            query.orderBy(sortKey, direction);
        } else {
            query.orderBy('due_date', 'asc');
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
        const allowedFields = ['title', 'content', 'reminder_type', 'frequency', 'due_date'];

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
};

export const tabs: Tabs = {
    all: async ({
        user,
        perPage = 10,
        page = 1,
        search = '',
        sortKey = 'created_at',
        direction = 'desc',
        highlight = false,
    }: TabsQueryParams) => {
        const query = db
            .select('tabs.id', 'tabs.user_id', 'tabs.created_at', 'tabs.updated_at')
            .select(
                db.raw(
                    '(SELECT COUNT(*) FROM tab_items WHERE tab_items.tab_id = tabs.id) as items_count',
                ),
            )
            .from('tabs')
            .where('tabs.user_id', user.id);

        if (highlight && search) {
            query
                .select(db.raw(`${sqlHighlight('tabs.title', search)} as title`))
                .select(db.raw(`${sqlHighlight('tabs.trigger', search)} as trigger`));
        } else {
            query.select('tabs.title').select('tabs.trigger');
        }

        if (search) {
            const searchTerms = search
                .toLowerCase()
                .trim()
                .split(/\s+/)
                .filter((term) => term.length > 0)
                .map((term) => term.replace(/[%_]/g, '\\$&'));

            query.where((q) => {
                searchTerms.forEach((term) => {
                    q.andWhere((subQ) => {
                        subQ.whereRaw('LOWER(tabs.title) LIKE ?', [`%${term}%`])
                            .orWhereRaw('LOWER(tabs.trigger) LIKE ?', [`%${term}%`])
                            .orWhereExists((subquery) => {
                                subquery
                                    .select(db.raw('1'))
                                    .from('tab_items')
                                    .whereRaw('tab_items.tab_id = tabs.id')
                                    .where((itemBuilder) => {
                                        itemBuilder
                                            .whereRaw('LOWER(tab_items.title) LIKE ?', [
                                                `%${term}%`,
                                            ])
                                            .orWhereRaw('LOWER(tab_items.url) LIKE ?', [
                                                `%${term}%`,
                                            ]);
                                    });
                            });
                    });
                });
            });
        }

        if (['title', 'trigger', 'created_at', 'items_count'].includes(sortKey)) {
            if (sortKey === 'items_count') {
                query.orderByRaw('items_count ' + direction);
            } else {
                query.orderBy(`tabs.${sortKey}`, direction);
            }
        } else {
            query.orderBy('tabs.created_at', 'desc');
        }

        const result = await query.paginate({ perPage, currentPage: page, isLengthAware: true });

        // Fetch tab items for all tabs if needed
        if (result.data.length > 0) {
            const tabIds = result.data.map((tab: any) => tab.id);

            let itemsQuery = db
                .select('id', 'tab_id', 'created_at', 'updated_at')
                .from('tab_items')
                .whereIn('tab_id', tabIds);

            if (highlight && search) {
                itemsQuery = itemsQuery
                    .select(db.raw(`${sqlHighlight('tab_items.title', search)} as title`))
                    .select(db.raw(`${sqlHighlight('tab_items.url', search)} as url`));
            } else {
                itemsQuery = itemsQuery
                    .select('tab_items.title as title')
                    .select('tab_items.url as url');
            }

            if (search) {
                itemsQuery = itemsQuery.where((builder) => {
                    builder
                        .whereRaw('LOWER(tab_items.title) LIKE ?', [`%${search.toLowerCase()}%`])
                        .orWhereRaw('LOWER(tab_items.url) LIKE ?', [`%${search.toLowerCase()}%`]);
                });
            }

            const allItems = await itemsQuery.orderBy('created_at', 'asc');

            // Group items by tab_id
            const itemsByTab = allItems.reduce((acc: any, item: any) => {
                if (!acc[item.tab_id]) acc[item.tab_id] = [];
                acc[item.tab_id].push(item);
                return acc;
            }, {});

            // Assign items to tabs
            for (const tab of result.data) {
                (tab as any).items = itemsByTab[(tab as any).id] || [];
            }
        }

        return result;
    },

    create: async (tab: Tab) => {
        if (!tab.title || !tab.trigger || !tab.user_id) {
            throw new Error('Missing required fields to create a tab');
        }

        const [createdTab] = await db('tabs')
            .insert({
                title: tab.title,
                trigger: tab.trigger,
                user_id: tab.user_id,
            })
            .returning('*');
        return createdTab;
    },

    read: async (id: number, userId: number) => {
        const tab = await db
            .select('tabs.*')
            .select(
                db.raw(
                    '(SELECT COUNT(*) FROM tab_items WHERE tab_items.tab_id = tabs.id) as items_count',
                ),
            )
            .from('tabs')
            .where({ 'tabs.id': id, 'tabs.user_id': userId })
            .first();

        if (!tab) {
            return null;
        }

        // Get tab items
        const items = await db('tab_items')
            .select('*')
            .where({ tab_id: id })
            .orderBy('created_at', 'asc');

        tab.items = items;
        return tab;
    },

    update: async (id: number, userId: number, updates: Partial<Tab>) => {
        const allowedFields = ['title', 'trigger'];

        const updateData = Object.fromEntries(
            Object.entries(updates).filter(([key]) => allowedFields.includes(key)),
        );

        if (Object.keys(updateData).length === 0) {
            throw new Error('No valid fields provided for update');
        }

        const [updatedTab] = await db('tabs')
            .where({ id, user_id: userId })
            .update(updateData)
            .returning('*');

        if (!updatedTab) {
            return null;
        }

        return updatedTab;
    },

    delete: async (id: number, userId: number) => {
        const rowsAffected = await db('tabs').where({ id, user_id: userId }).delete();
        return rowsAffected > 0;
    },
};
