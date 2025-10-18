import type { Bookmark, Bookmarks, BookmarksQueryParams, AppContext } from '../../type';

export function BookmarksRepository(context: AppContext): Bookmarks {
    return {
        all: async ({
            user,
            perPage = 10,
            page = 1,
            search = '',
            sortKey = 'created_at',
            direction = 'desc',
            highlight = false,
            excludeHidden = false,
        }: BookmarksQueryParams) => {
            const query = context.db.select(
                'id',
                'user_id',
                'pinned',
                'created_at',
                'updated_at',
                'hidden',
            );

            if (highlight && search) {
                query
                    .select(
                        context.db.raw(
                            `${context.utils.html.sqlHighlightSearchTerm('title', search)} as title`,
                        ),
                    )
                    .select(
                        context.db.raw(
                            `${context.utils.html.sqlHighlightSearchTerm('url', search)} as url`,
                        ),
                    );
            } else {
                query.select('title').select('url');
            }

            query.from('bookmarks').where('user_id', user.id);

            if (excludeHidden) {
                query.where((q: any) => {
                    q.where('hidden', false).orWhereNull('hidden');
                });
            }

            if (search) {
                const searchTerms = search
                    .toLowerCase()
                    .trim()
                    .split(/\s+/) // Split on whitespace
                    .filter((term) => term.length > 0)
                    .map((term) => term.replace(/[%_]/g, '\\$&')); // Escape LIKE special chars

                query.where((q: any) => {
                    // Each term must match either title or url
                    searchTerms.forEach((term) => {
                        q.andWhere((subQ: any) => {
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

            if (['title', 'url', 'created_at', 'pinned', 'hidden'].includes(sortKey)) {
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

            const [createdBookmark] = await context.db('bookmarks').insert(bookmark).returning('*');
            return createdBookmark;
        },

        read: async (id: number, userId: number) => {
            const bookmark = await context.db
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
            const allowedFields = ['title', 'url', 'pinned', 'hidden'];

            const updateData = Object.fromEntries(
                Object.entries(updates).filter(([key]) => allowedFields.includes(key)),
            );

            if (Object.keys(updateData).length === 0) {
                throw new Error('No valid fields provided for update');
            }

            const [updatedBookmark] = await context
                .db('bookmarks')
                .where({ id, user_id: userId })
                .update(updateData)
                .returning('*');

            if (!updatedBookmark) {
                return null;
            }

            return updatedBookmark;
        },

        delete: async (id: number, userId: number) => {
            const rowsAffected = await context
                .db('bookmarks')
                .where({ id, user_id: userId })
                .delete();
            return rowsAffected > 0;
        },

        bulkDelete: async (ids: number[], userId: number) => {
            return context.db.transaction(async (trx: any) => {
                const rowsAffected = await trx('bookmarks')
                    .whereIn('id', ids)
                    .where('user_id', userId)
                    .delete();

                return rowsAffected;
            });
        },
    };
}
