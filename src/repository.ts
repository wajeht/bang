import {
    Note,
    Action,
    Bookmark,
    NotesQueryParams,
    ActionsQueryParams,
    BookmarksQueryParams,
} from './type';
import { db } from './db/db';
import { Actions, Bookmarks, Notes } from './type';

export const actions: Actions = {
    all: async ({
        user,
        perPage = 10,
        page = 1,
        search = '',
        sortKey = 'created_at',
        direction = 'desc',
    }: ActionsQueryParams) => {
        const query = db
            .select('bangs.*', 'action_types.name as action_type')
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

        if (['name', 'trigger', 'url', 'created_at', 'action_type'].includes(sortKey)) {
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
    }: BookmarksQueryParams) => {
        const query = db.select('*').from('bookmarks').where('user_id', user.id);

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

        if (['title', 'url', 'created_at'].includes(sortKey)) {
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
        const allowedFields = ['title', 'url'];

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
    }: NotesQueryParams) => {
        const query = db.select('*').from('notes').where('user_id', user.id);

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

        if (['title', 'content', 'created_at'].includes(sortKey)) {
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
        const allowedFields = ['title', 'content'];

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
