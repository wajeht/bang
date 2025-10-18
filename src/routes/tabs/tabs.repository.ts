import type { Tab, Tabs, TabsQueryParams, AppContext } from '../../type';

export function TabsRepository(ctx: AppContext): Tabs {
    return {
        all: async ({
            user,
            perPage = 10,
            page = 1,
            search = '',
            sortKey = 'created_at',
            direction = 'desc',
            highlight = false,
        }: TabsQueryParams) => {
            const query = ctx.db
                .select('tabs.id', 'tabs.user_id', 'tabs.created_at', 'tabs.updated_at')
                .select(
                    ctx.db.raw(
                        '(SELECT COUNT(*) FROM tab_items WHERE tab_items.tab_id = tabs.id) as items_count',
                    ),
                )
                .from('tabs')
                .where('tabs.user_id', user.id);

            if (highlight && search) {
                query
                    .select(
                        ctx.db.raw(
                            `${ctx.utils.html.sqlHighlightSearchTerm('tabs.title', search)} as title`,
                        ),
                    )
                    .select(
                        ctx.db.raw(
                            `${ctx.utils.html.sqlHighlightSearchTerm('tabs.trigger', search)} as trigger`,
                        ),
                    );
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

                query.where((q: any) => {
                    searchTerms.forEach((term) => {
                        q.andWhere((subQ: any) => {
                            subQ.whereRaw('LOWER(tabs.title) LIKE ?', [`%${term}%`])
                                .orWhereRaw('LOWER(tabs.trigger) LIKE ?', [`%${term}%`])
                                .orWhereExists((subquery: any) => {
                                    subquery
                                        .select(ctx.db.raw('1'))
                                        .from('tab_items')
                                        .whereRaw('tab_items.tab_id = tabs.id')
                                        .where((itemBuilder: any) => {
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

            const result = await query.paginate({
                perPage,
                currentPage: page,
                isLengthAware: true,
            });

            // Fetch tab items for all tabs if needed
            if (result.data.length > 0) {
                const tabIds = result.data.map((tab: any) => tab.id);

                let itemsQuery = ctx.db
                    .select('id', 'tab_id', 'created_at', 'updated_at')
                    .from('tab_items')
                    .whereIn('tab_id', tabIds);

                if (highlight && search) {
                    itemsQuery = itemsQuery
                        .select(
                            ctx.db.raw(
                                `${ctx.utils.html.sqlHighlightSearchTerm('tab_items.title', search)} as title`,
                            ),
                        )
                        .select(
                            ctx.db.raw(
                                `${ctx.utils.html.sqlHighlightSearchTerm('tab_items.url', search)} as url`,
                            ),
                        );
                } else {
                    itemsQuery = itemsQuery
                        .select('tab_items.title as title')
                        .select('tab_items.url as url');
                }

                if (search) {
                    itemsQuery = itemsQuery.where((builder: any) => {
                        builder
                            .whereRaw('LOWER(tab_items.title) LIKE ?', [
                                `%${search.toLowerCase()}%`,
                            ])
                            .orWhereRaw('LOWER(tab_items.url) LIKE ?', [
                                `%${search.toLowerCase()}%`,
                            ]);
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

            const [createdTab] = await ctx
                .db('tabs')
                .insert({
                    title: tab.title,
                    trigger: tab.trigger,
                    user_id: tab.user_id,
                })
                .returning('*');
            return createdTab;
        },

        read: async (id: number, userId: number) => {
            const tab = await ctx.db
                .select('tabs.*')
                .select(
                    ctx.db.raw(
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
            const items = await ctx
                .db('tab_items')
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

            const [updatedTab] = await ctx
                .db('tabs')
                .where({ id, user_id: userId })
                .update(updateData)
                .returning('*');

            if (!updatedTab) {
                return null;
            }

            return updatedTab;
        },

        delete: async (id: number, userId: number) => {
            const rowsAffected = await ctx.db('tabs').where({ id, user_id: userId }).delete();
            return rowsAffected > 0;
        },

        bulkDelete: async (ids: number[], userId: number) => {
            return ctx.db.transaction(async (trx: any) => {
                const rowsAffected = await trx('tabs')
                    .whereIn('id', ids)
                    .where('user_id', userId)
                    .delete();

                return rowsAffected;
            });
        },
    };
}
