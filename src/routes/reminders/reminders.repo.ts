import type { Reminder, Reminders, RemindersQueryParams, AppContext } from '../../type';

export function RemindersRepository(ctx: AppContext): Reminders {
    return {
        all: async ({
            user,
            perPage = 20,
            page = 1,
            search = '',
            sortKey = 'due_date',
            direction = 'asc',
            highlight = false,
        }: RemindersQueryParams) => {
            const query = ctx.db.select(
                'id',
                'user_id',
                'reminder_type',
                'frequency',
                'created_at',
                'updated_at',
            );

            if (highlight && search) {
                query
                    .select(
                        ctx.db.raw(
                            `${ctx.utils.html.sqlHighlightSearchTerm('title', search)} as title`,
                        ),
                    )
                    .select(
                        ctx.db.raw(
                            `${ctx.utils.html.sqlHighlightSearchTerm('content', search)} as content`,
                        ),
                    )
                    .select(
                        ctx.db.raw(
                            `${ctx.utils.html.sqlHighlightSearchTerm('CAST(due_date AS TEXT)', search)} as due_date`,
                        ),
                    );
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

                query.where((q: any) => {
                    // Each term must match title, content, or frequency
                    searchTerms.forEach((term) => {
                        q.andWhere((subQ: any) => {
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

            const [createdReminder] = await ctx.db('reminders').insert(reminder).returning('*');
            return createdReminder;
        },

        read: async (id: number, userId: number) => {
            const reminder = await ctx.db
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

            const [updatedReminder] = await ctx
                .db('reminders')
                .where({ id, user_id: userId })
                .update(updateData)
                .returning('*');

            if (!updatedReminder) {
                return null;
            }

            return updatedReminder;
        },

        delete: async (id: number, userId: number) => {
            const rowsAffected = await ctx.db('reminders').where({ id, user_id: userId }).delete();
            return rowsAffected > 0;
        },

        bulkDelete: async (ids: number[], userId: number) => {
            return ctx.db.transaction(async (trx: any) => {
                const rowsAffected = await trx('reminders')
                    .whereIn('id', ids)
                    .where('user_id', userId)
                    .delete();

                return rowsAffected;
            });
        },
    };
}
