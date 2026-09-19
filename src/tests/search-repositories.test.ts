import { describe, expect, it } from 'vite-plus/test';
import { createTestUser, ctx, db } from './test-setup.js';

interface SearchResource {
    model: 'actions' | 'bookmarks' | 'notes' | 'reminders' | 'tabs';
    table: string;
    titleColumn: string;
    fields: Record<string, string>;
}

const RESOURCES: SearchResource[] = [
    {
        model: 'actions',
        table: 'bangs',
        titleColumn: 'name',
        fields: { trigger: '!matching', url: 'https://example.com' },
    },
    {
        model: 'bookmarks',
        table: 'bookmarks',
        titleColumn: 'title',
        fields: { url: 'https://example.com' },
    },
    { model: 'notes', table: 'notes', titleColumn: 'title', fields: { content: 'Saved content' } },
    {
        model: 'reminders',
        table: 'reminders',
        titleColumn: 'title',
        fields: { reminder_type: 'once' },
    },
    { model: 'tabs', table: 'tabs', titleColumn: 'title', fields: { trigger: '!matching' } },
];

const SEARCH_CASES = [
    { search: '%', matching: 'literal % marker', decoy: 'literal X marker' },
    { search: '_', matching: 'literal _ marker', decoy: 'literal X marker' },
    { search: '\\', matching: 'literal \\ marker', decoy: 'literal X marker' },
    { search: '\\%', matching: 'literal \\% marker', decoy: 'literal \\X marker' },
    { search: 'a %', matching: 'a literal % marker', decoy: 'a literal X marker' },
    { search: 'budget %', matching: 'budget literal % marker', decoy: 'budget literal X marker' },
    { search: 'budget _', matching: 'budget literal _ marker', decoy: 'budget literal X marker' },
    { search: 'budget \\', matching: 'budget literal \\ marker', decoy: 'budget literal X marker' },
    { search: 'budget_item', matching: 'budget_item marker', decoy: 'budgetXitem marker' },
    { search: 'budget\\item', matching: 'budget\\item marker', decoy: 'budget item marker' },
    { search: 'needle alpha', matching: 'needle alpha marker', decoy: 'needle beta marker' },
];

describe.each(RESOURCES)('$model repository search', (resource) => {
    it.each(SEARCH_CASES)(
        'should match $search literally or through ordinary FTS',
        async ({ search, matching, decoy }) => {
            const user = await createTestUser('search@example.com');
            const [expected] = await db(resource.table)
                .insert({
                    ...resource.fields,
                    user_id: user.id,
                    [resource.titleColumn]: matching,
                })
                .returning('id');
            await db(resource.table).insert({
                ...resource.fields,
                ...(resource.fields.trigger ? { trigger: '!decoy' } : {}),
                user_id: user.id,
                [resource.titleColumn]: decoy,
            });

            const result = await ctx.models[resource.model].all({
                user,
                search,
                perPage: 10,
                page: 1,
                sortKey: 'created_at',
                direction: 'asc',
            });

            expect(result.data).toHaveLength(1);
            expect(result.data[0]?.id).toBe(expected.id);
        },
    );
});

describe('tab item search', () => {
    it.each(SEARCH_CASES)(
        'should match $search in child items without wildcard expansion',
        async ({ search, matching, decoy }) => {
            const user = await createTestUser('tab-search@example.com');
            const [tab] = await db('tabs')
                .insert({ user_id: user.id, trigger: '!group', title: 'Tab group' })
                .returning('id');
            const [expected] = await db('tab_items')
                .insert({ tab_id: tab.id, title: matching, url: 'https://example.com' })
                .returning('id');
            await db('tab_items').insert({
                tab_id: tab.id,
                title: decoy,
                url: 'https://example.com',
            });

            const result = await ctx.models.tabs.all({
                user,
                search,
                perPage: 10,
                page: 1,
                sortKey: 'created_at',
                direction: 'asc',
            });

            expect(result.data).toHaveLength(1);
            expect(result.data[0]?.items).toHaveLength(1);
            expect(result.data[0]?.items?.[0]?.id).toBe(expected.id);
        },
    );
});
