import type { Reminder, Reminders, RemindersQueryParams, AppContext } from '../../type';

export function RemindersRepository(ctx: AppContext): Reminders {
    const REGEX_WHITESPACE = /\s+/;
    const ALLOWED_SORT_KEYS = new Set(['title', 'content', 'due_date', 'frequency', 'created_at']);
    const ALLOWED_UPDATE_FIELDS = new Set([
        'title',
        'content',
        'reminder_type',
        'frequency',
        'due_date',
    ]);

    return {
        all: async ({
            user,
            perPage = 20,
            page = 1,
            search = '',
            sortKey = 'due_date',
            direction = 'asc',
        }: RemindersQueryParams) => {
            const query = ctx.db.select(
                'id',
                'user_id',
                'reminder_type',
                'frequency',
                'created_at',
                'updated_at',
                'title',
                'content',
                'due_date',
            );

            query.from('reminders').where('user_id', user.id);

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

                // Each term must match title, content, or frequency
                query.where((q: any) => {
                    for (let i = 0; i < searchTerms.length; i++) {
                        const term = searchTerms[i]!;
                        q.andWhere((subQ: any) => {
                            subQ.whereRaw('LOWER(title) LIKE ?', [`%${term}%`])
                                .orWhereRaw('LOWER(content) LIKE ?', [`%${term}%`])
                                .orWhereRaw('LOWER(frequency) LIKE ?', [`%${term}%`]);
                        });
                    }
                });
            }

            if (ALLOWED_SORT_KEYS.has(sortKey)) {
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

        delete: async (ids: number[], userId: number) => {
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
