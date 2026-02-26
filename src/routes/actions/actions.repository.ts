import type { Action, Actions, ActionsQueryParams, AppContext } from '../../type';

export function createActionsRepository(ctx: AppContext): Actions {
    const REGEX_WHITESPACE = /\s+/;
    const ALLOWED_SORT_KEYS = new Set([
        'name',
        'trigger',
        'url',
        'created_at',
        'action_type',
        'last_read_at',
        'usage_count',
        'hidden',
    ]);
    const ALLOWED_UPDATE_FIELDS = new Set(['name', 'trigger', 'url', 'actionType', 'hidden']);
    const VALID_ACTION_TYPES = new Set(['search', 'redirect']);

    return {
        all: async ({
            user,
            perPage = 10,
            page = 1,
            search = '',
            sortKey = 'created_at',
            direction = 'desc',
            excludeHidden = false,
        }: ActionsQueryParams) => {
            const query = ctx.db.select(
                'bangs.id',
                'bangs.user_id',
                'bangs.action_type',
                'bangs.created_at',
                'bangs.updated_at',
                'bangs.last_read_at',
                'bangs.usage_count',
                'bangs.hidden',
                'bangs.name',
                'bangs.trigger',
                'bangs.url',
            );

            query.from('bangs').where('bangs.user_id', user.id);

            // Exclude hidden redirect actions if requested
            if (excludeHidden) {
                query.where((q: any) => {
                    q.where((subQ: any) => {
                        // Include all non-redirect actions
                        subQ.whereNot('bangs.action_type', 'redirect')
                            // Or redirect actions that are not hidden
                            .orWhere((innerQ: any) => {
                                innerQ
                                    .where('bangs.action_type', 'redirect')
                                    .where((hiddenQ: any) => {
                                        hiddenQ
                                            .where('bangs.hidden', false)
                                            .orWhereNull('bangs.hidden');
                                    });
                            });
                    });
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

                // Each term must match name, trigger, or url
                query.where((q: any) => {
                    for (let i = 0; i < searchTerms.length; i++) {
                        const term = searchTerms[i]!;
                        q.andWhere((subQ: any) => {
                            subQ.whereRaw('LOWER(bangs.name) LIKE ?', [`%${term}%`])
                                .orWhereRaw('LOWER(bangs.trigger) LIKE ?', [`%${term}%`])
                                .orWhereRaw('LOWER(bangs.url) LIKE ?', [`%${term}%`]);
                        });
                    }
                });
            }

            if (ALLOWED_SORT_KEYS.has(sortKey)) {
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

            if (!VALID_ACTION_TYPES.has(action.actionType)) {
                throw new Error('Invalid action type');
            }

            const { actionType, ...rest } = action;
            const actionData = { ...rest, action_type: actionType };

            const [createdAction] = await ctx.db('bangs').insert(actionData).returning('*');
            return createdAction;
        },

        read: async (id: number, userId: number) => {
            const action = await ctx.db
                .select(
                    'bangs.id',
                    'bangs.name',
                    'bangs.trigger',
                    'bangs.url',
                    'bangs.action_type',
                    'bangs.created_at',
                    'bangs.last_read_at',
                    'bangs.hidden',
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

            if (!VALID_ACTION_TYPES.has(updates.actionType)) {
                throw new Error('Invalid action type');
            }

            updateData.action_type = updates.actionType;

            const { actionType: _actionType, ...rest } = updateData;

            const [updatedAction] = await ctx
                .db('bangs')
                .where({ id, user_id: userId })
                .update(rest)
                .returning('*');

            if (!updatedAction) {
                return null;
            }

            return updatedAction;
        },

        delete: async (ids: number[], userId: number) => {
            return ctx.db.transaction(async (trx: any) => {
                const rowsAffected = await trx('bangs')
                    .whereIn('id', ids)
                    .where('user_id', userId)
                    .delete();

                return rowsAffected;
            });
        },
    };
}
