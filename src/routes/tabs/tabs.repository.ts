import { escapeLikePattern } from '../../utils/sql-like.js';
import type { Tab, Tabs, TabsQueryParams, AppContext } from '../../type.js';

export function createTabsRepository(ctx: AppContext): Tabs {
    const REGEX_WHITESPACE = /\s+/;
    const ALLOWED_UPDATE_FIELDS = new Set(['title', 'trigger']);
    const ALLOWED_SORT_KEYS = new Set(['title', 'trigger', 'created_at', 'items_count']);

    return {
        all: async ({
            user,
            perPage,
            page,
            search,
            sortKey,
            direction,
            isLengthAware = true,
        }: TabsQueryParams) => {
            const query = ctx.db
                .select(
                    'tabs.id',
                    'tabs.user_id',
                    'tabs.created_at',
                    'tabs.updated_at',
                    'tabs.title',
                    'tabs.trigger',
                )
                .select(
                    ctx.db.raw(
                        '(SELECT COUNT(*) FROM tab_items WHERE tab_items.tab_id = tabs.id) as items_count',
                    ),
                )
                .from('tabs')
                .where('tabs.user_id', user.id);

            if (search) {
                const ftsQuery = ctx.utils.util.buildFtsQuery(search);

                if (ftsQuery) {
                    query.whereIn(
                        'tabs.id',
                        ctx.db
                            .select('rowid')
                            .from('tabs_fts')
                            .whereRaw('tabs_fts MATCH ?', [ftsQuery]),
                    );
                } else {
                    // Split search into terms and escape SQL wildcards
                    const rawTerms = search.toLowerCase().trim().split(REGEX_WHITESPACE);
                    const searchTerms: string[] = [];

                    for (let i = 0; i < rawTerms.length; i++) {
                        const term = rawTerms[i];

                        if (term && term.length > 0) {
                            searchTerms.push(escapeLikePattern(term));
                        }
                    }

                    // Each term must match title, trigger, or tab item title/url
                    query.where((q: any) => {
                        for (let i = 0; i < searchTerms.length; i++) {
                            const term = searchTerms[i]!;
                            q.andWhere((subQ: any) => {
                                subQ.whereRaw("LOWER(tabs.title) LIKE ? ESCAPE '\\'", [`%${term}%`])
                                    .orWhereRaw("LOWER(tabs.trigger) LIKE ? ESCAPE '\\'", [
                                        `%${term}%`,
                                    ])
                                    .orWhereExists((subquery: any) => {
                                        subquery
                                            .select(ctx.db.raw('1'))
                                            .from('tab_items')
                                            .whereRaw('tab_items.tab_id = tabs.id')
                                            .where((itemBuilder: any) => {
                                                itemBuilder
                                                    .whereRaw(
                                                        "LOWER(tab_items.title) LIKE ? ESCAPE '\\'",
                                                        [`%${term}%`],
                                                    )
                                                    .orWhereRaw(
                                                        "LOWER(tab_items.url) LIKE ? ESCAPE '\\'",
                                                        [`%${term}%`],
                                                    );
                                            });
                                    });
                            });
                        }
                    });
                }
            }

            if (ALLOWED_SORT_KEYS.has(sortKey)) {
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
                isLengthAware,
            });

            // Fetch tab items for all tabs
            if (result.data.length > 0) {
                // Collect all tab IDs for batch query
                const tabIds: number[] = [];

                for (let i = 0; i < result.data.length; i++) {
                    tabIds.push((result.data[i] as any).id);
                }

                let itemsQuery = ctx.db
                    .select('id', 'tab_id', 'created_at', 'updated_at', 'title', 'url')
                    .from('tab_items')
                    .whereIn('tab_id', tabIds);

                if (search) {
                    const ftsQuery = ctx.utils.util.buildFtsQuery(search);

                    if (ftsQuery) {
                        itemsQuery = itemsQuery.whereIn(
                            'id',
                            ctx.db
                                .select('rowid')
                                .from('tab_items_fts')
                                .whereRaw('tab_items_fts MATCH ?', [ftsQuery]),
                        );
                    } else {
                        const rawTerms = search.toLowerCase().trim().split(REGEX_WHITESPACE);

                        for (const term of rawTerms) {
                            if (!term) continue;
                            const pattern = `%${escapeLikePattern(term)}%`;
                            itemsQuery = itemsQuery.andWhere((builder) => {
                                builder
                                    .whereRaw("LOWER(tab_items.title) LIKE ? ESCAPE '\\'", [
                                        pattern,
                                    ])
                                    .orWhereRaw("LOWER(tab_items.url) LIKE ? ESCAPE '\\'", [
                                        pattern,
                                    ]);
                            });
                        }
                    }
                }

                const allItems = await itemsQuery.orderBy('created_at', 'asc');

                // Group items by tab_id for efficient assignment
                const itemsByTab: Record<number, any[]> = {};

                for (let i = 0; i < allItems.length; i++) {
                    const item = allItems[i]!;

                    if (!itemsByTab[item.tab_id]) itemsByTab[item.tab_id] = [];
                    itemsByTab[item.tab_id]!.push(item);
                }

                // Assign items to tabs
                for (let i = 0; i < result.data.length; i++) {
                    const tab = result.data[i] as any;
                    tab.items = itemsByTab[tab.id] || [];
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

        delete: async (ids: number[], userId: number) => {
            return ctx.db('tabs').whereIn('id', ids).where('user_id', userId).delete();
        },
    };
}
