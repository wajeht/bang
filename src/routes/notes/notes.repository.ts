import type { Note, Notes, NotesQueryParams, AppContext } from '../../type';

export function NotesRepository(ctx: AppContext): Notes {
    const REGEX_WHITESPACE = /\s+/;
    const ALLOWED_SORT_KEYS = new Set(['title', 'content', 'created_at', 'pinned', 'hidden']);
    const ALLOWED_UPDATE_FIELDS = new Set(['title', 'content', 'pinned', 'hidden']);

    return {
        all: async ({
            user,
            perPage = 10,
            page = 1,
            search = '',
            sortKey = 'created_at',
            direction = 'desc',
            excludeHidden = false,
        }: NotesQueryParams) => {
            const query = ctx.db.select(
                'id',
                'user_id',
                'pinned',
                'created_at',
                'updated_at',
                'hidden',
                'title',
                'content',
            );

            query.from('notes').where('user_id', user.id);

            if (excludeHidden) {
                query.where((q: any) => {
                    q.where('hidden', false).orWhereNull('hidden');
                });
            }

            if (search) {
                // Split search into terms and escape SQL wildcards
                const rawTerms = search.toLowerCase().trim().split(REGEX_WHITESPACE);
                const searchTerms: string[] = [];
                for (let i = 0; i < rawTerms.length; i++) {
                    const term = rawTerms[i];
                    if (term && term.length > 0) {
                        searchTerms.push(term.replace(/[%_]/g, '\\$&'));
                    }
                }

                // Each term must match either title or content
                query.where((q: any) => {
                    for (let i = 0; i < searchTerms.length; i++) {
                        const term = searchTerms[i]!;
                        q.andWhere((subQ: any) => {
                            subQ.whereRaw('LOWER(title) LIKE ?', [`%${term}%`]).orWhereRaw(
                                'LOWER(content) LIKE ?',
                                [`%${term}%`],
                            );
                        });
                    }
                });
            }

            // Always sort by pinned first (pinned notes at top), then by the requested sort
            query.orderBy('pinned', 'desc');

            if (ALLOWED_SORT_KEYS.has(sortKey)) {
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

            const [createdNote] = await ctx.db('notes').insert(note).returning('*');
            return createdNote;
        },

        read: async (id: number, userId: number) => {
            const note = await ctx.db
                .select('*')
                .from('notes')
                .where({ id, user_id: userId })
                .first();

            if (!note) {
                return null;
            }

            return note;
        },

        update: async (id: number, userId: number, updates: Partial<Note>) => {
            // Filter to only allowed update fields
            const updateData: Record<string, unknown> = {};
            const entries = Object.entries(updates);
            for (let i = 0; i < entries.length; i++) {
                const entry = entries[i];
                if (!entry) continue;
                const [key, value] = entry;
                if (ALLOWED_UPDATE_FIELDS.has(key)) {
                    updateData[key] = value;
                }
            }

            if (Object.keys(updateData).length === 0) {
                throw new Error('No valid fields provided for update');
            }

            const [updatedNote] = await ctx
                .db('notes')
                .where({ id, user_id: userId })
                .update(updateData)
                .returning('*');

            if (!updatedNote) {
                return null;
            }

            return updatedNote;
        },

        delete: async (ids: number[], userId: number) => {
            return ctx.db.transaction(async (trx: any) => {
                const rowsAffected = await trx('notes')
                    .whereIn('id', ids)
                    .where('user_id', userId)
                    .delete();

                return rowsAffected;
            });
        },
    };
}
