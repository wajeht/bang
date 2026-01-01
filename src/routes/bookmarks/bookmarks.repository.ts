import type { Bookmark, Bookmarks, BookmarksQueryParams, AppContext } from '../../type';

export function BookmarksRepository(ctx: AppContext): Bookmarks {
    const REGEX_WHITESPACE = /\s+/;
    const ALLOWED_UPDATE_FIELDS = new Set(['title', 'url', 'pinned', 'hidden']);
    const ALLOWED_SORT_KEYS = new Set(['title', 'url', 'created_at', 'pinned', 'hidden']);

    return {
        all: async ({
            user,
            perPage = 10,
            page = 1,
            search = '',
            sortKey = 'created_at',
            direction = 'desc',
            excludeHidden = false,
        }: BookmarksQueryParams) => {
            const query = ctx.db.select(
                'id',
                'user_id',
                'pinned',
                'created_at',
                'updated_at',
                'hidden',
                'title',
                'url',
            );

            query.from('bookmarks').where('user_id', user.id);

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

                // Each term must match either title or url
                query.where((q: any) => {
                    for (let i = 0; i < searchTerms.length; i++) {
                        const term = searchTerms[i]!;
                        q.andWhere((subQ: any) => {
                            subQ.whereRaw('LOWER(title) LIKE ?', [`%${term}%`]).orWhereRaw(
                                'LOWER(url) LIKE ?',
                                [`%${term}%`],
                            );
                        });
                    }
                });
            }

            // Always sort by pinned first (pinned bookmarks at top), then by the requested sort
            query.orderBy('pinned', 'desc');

            if (ALLOWED_SORT_KEYS.has(sortKey)) {
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

            const [createdBookmark] = await ctx.db('bookmarks').insert(bookmark).returning('*');
            return createdBookmark;
        },

        read: async (id: number, userId: number) => {
            const bookmark = await ctx.db
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

            const [updatedBookmark] = await ctx
                .db('bookmarks')
                .where({ id, user_id: userId })
                .update(updateData)
                .returning('*');

            if (!updatedBookmark) {
                return null;
            }

            return updatedBookmark;
        },

        delete: async (ids: number[], userId: number) => {
            return ctx.db.transaction(async (trx: any) => {
                const rowsAffected = await trx('bookmarks')
                    .whereIn('id', ids)
                    .where('user_id', userId)
                    .delete();

                return rowsAffected;
            });
        },
    };
}
