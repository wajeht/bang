import { authenticateAgent } from '../../tests/test-utils.js';
import { db, app } from '../../tests/test-setup.js';
import { describe, it, expect } from 'vite-plus/test';

describe('Tabs Routes', () => {
    describe('Bulk Delete', () => {
        describe('POST /tabs/delete', () => {
            it('should delete multiple tab groups', async () => {
                const { agent, user } = await authenticateAgent(app);

                const [tab1] = await db('tabs')
                    .insert({ user_id: user.id, title: 'Tab 1', trigger: '!tab1' })
                    .returning('*');
                const [tab2] = await db('tabs')
                    .insert({ user_id: user.id, title: 'Tab 2', trigger: '!tab2' })
                    .returning('*');

                await agent
                    .post('/tabs/delete')
                    .send({ id: [tab1.id.toString(), tab2.id.toString()] })
                    .expect(302);

                const remainingTabs = await db('tabs').where({ user_id: user.id });
                expect(remainingTabs).toHaveLength(0);
            });

            it('should only delete tab groups owned by the user', async () => {
                const { agent, user } = await authenticateAgent(app);

                const [otherUser] = await db('users')
                    .insert({
                        username: 'otheruser',
                        email: 'other@example.com',
                        is_admin: false,
                        default_search_provider: 'duckduckgo',
                    })
                    .returning('*');

                const [userTab] = await db('tabs')
                    .insert({ user_id: user.id, title: 'My Tab', trigger: '!mytab' })
                    .returning('*');

                const [otherTab] = await db('tabs')
                    .insert({
                        user_id: otherUser.id,
                        title: 'Other Tab',
                        trigger: '!othertab',
                    })
                    .returning('*');

                await agent
                    .post('/tabs/delete')
                    .send({ id: [userTab.id.toString(), otherTab.id.toString()] })
                    .expect(302);

                const userTabs = await db('tabs').where({ user_id: user.id });
                expect(userTabs).toHaveLength(0);

                const otherTabs = await db('tabs').where({ user_id: otherUser.id });
                expect(otherTabs).toHaveLength(1);
            });

            it('should require id array', async () => {
                const { agent } = await authenticateAgent(app);

                await agent.post('/tabs/delete').type('form').send({}).expect(302);
            });
        });
    });

    describe('Tab Items Security', () => {
        it('should not allow updating tab items from other users tabs', async () => {
            const { agent } = await authenticateAgent(app);

            const [otherUser] = await db('users')
                .insert({
                    username: 'otheruser2',
                    email: 'other2@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                })
                .returning('*');

            const [otherTab] = await db('tabs')
                .insert({
                    user_id: otherUser.id,
                    title: 'Other Tab',
                    trigger: '!othertab2',
                })
                .returning('*');

            const [otherTabItem] = await db('tab_items')
                .insert({
                    tab_id: otherTab.id,
                    title: 'Original Title',
                    url: 'https://example.com',
                })
                .returning('*');

            await agent
                .post(`/tabs/${otherTab.id}/items/${otherTabItem.id}/update`)
                .type('form')
                .send({ title: 'Hacked Title', url: 'https://hacked.com' })
                .expect(404);

            const item = await db('tab_items').where({ id: otherTabItem.id }).first();
            expect(item.title).toBe('Original Title');
        });
    });

    describe('Search Highlighting', () => {
        it('should highlight search terms in title and trigger', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('tabs').insert([
                { user_id: user.id, title: 'Development Tools', trigger: '!devtools' },
                { user_id: user.id, title: 'Other Tabs', trigger: '!other' },
            ]);

            const response = await agent.get('/tabs?search=dev').expect(200);

            expect(response.text).toContain('<mark>Dev</mark>elopment Tools');
            expect(response.text).toContain('!<mark>dev</mark>tools');
            expect(response.text).not.toContain('Other Tabs');
        });

        it('should highlight multiple search words', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('tabs').insert({
                user_id: user.id,
                title: 'Social Media Apps',
                trigger: '!social',
            });

            const response = await agent.get('/tabs?search=social+media').expect(200);

            expect(response.text).toContain('<mark>Social</mark>');
            expect(response.text).toContain('<mark>Media</mark>');
        });

        it('should find tabs by matching tab item text', async () => {
            const { agent, user } = await authenticateAgent(app);

            const [tab] = await db('tabs')
                .insert({
                    user_id: user.id,
                    title: 'Work Apps',
                    trigger: '!work',
                })
                .returning('*');

            await db('tab_items').insert([
                {
                    tab_id: tab.id,
                    title: 'Linear Project Board',
                    url: 'https://linear.app/team/issues',
                },
                {
                    tab_id: tab.id,
                    title: 'Calendar',
                    url: 'https://calendar.example.com',
                },
            ]);

            const response = await agent.get('/tabs?search=linear').expect(200);

            expect(response.text).toContain('Work Apps');
            expect(response.text).toContain('Linear Project Board');
            expect(response.text).not.toContain('Calendar');
        });

        it('should return all results without highlighting when no search term', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('tabs').insert([
                { user_id: user.id, title: 'Tab One', trigger: '!one' },
                { user_id: user.id, title: 'Tab Two', trigger: '!two' },
            ]);

            const response = await agent.get('/tabs').expect(200);

            expect(response.text).toContain('Tab One');
            expect(response.text).toContain('Tab Two');
            expect(response.text).not.toContain('<mark>');
        });
    });

    describe('Database Indexes', () => {
        it('should have index on tab_items.tab_id for efficient JOINs', async () => {
            const indexes = await db.raw(
                "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='tab_items'",
            );
            const indexNames = indexes.map((idx: any) => idx.name);
            expect(indexNames).toContain('tab_items_tab_id_idx');
        });

        it('should have composite index on tab_items for sorting', async () => {
            const indexes = await db.raw(
                "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='tab_items'",
            );
            const indexNames = indexes.map((idx: any) => idx.name);
            expect(indexNames).toContain('tab_items_tab_id_created_idx');
        });

        it('should have index on tabs for user queries', async () => {
            const indexes = await db.raw(
                "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='tabs'",
            );
            const indexNames = indexes.map((idx: any) => idx.name);
            expect(indexNames).toContain('tabs_user_created_idx');
        });

        it('should efficiently query tabs with items count', async () => {
            const { user } = await authenticateAgent(app);

            // Create multiple tabs with items
            for (let i = 0; i < 5; i++) {
                const [tab] = await db('tabs')
                    .insert({ user_id: user.id, title: `Tab ${i}`, trigger: `!tab${i}` })
                    .returning('*');

                for (let j = 0; j < 3; j++) {
                    await db('tab_items').insert({
                        tab_id: tab.id,
                        title: `Item ${j}`,
                        url: `https://example${j}.com`,
                    });
                }
            }

            // Query should complete quickly with indexes
            const startTime = Date.now();
            const tabs = await db
                .select('tabs.*')
                .select(
                    db.raw(
                        '(SELECT COUNT(*) FROM tab_items WHERE tab_items.tab_id = tabs.id) as items_count',
                    ),
                )
                .from('tabs')
                .where('tabs.user_id', user.id);
            const duration = Date.now() - startTime;

            expect(tabs).toHaveLength(5);
            expect(tabs[0].items_count).toBe(3);
            expect(duration).toBeLessThan(100);
        });
    });
});
