import {
    cleanupTestData,
    authenticateAgent,
    cleanupTestDatabase,
    authenticateApiAgent,
} from '../../tests/api-test-utils';
import { createApp } from '../../app';
import { db } from '../../tests/test-setup';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

describe('Tabs Routes', () => {
    let app: any;

    beforeAll(async () => {
        await db.migrate.latest();
    });

    beforeEach(async () => {
        const { app: expressApp } = await createApp();
        app = expressApp;
    });

    afterEach(async () => {
        await cleanupTestData();
    });

    afterAll(async () => {
        await cleanupTestDatabase();
    });

    describe('Bulk Delete', () => {
        describe('POST /tabs/delete-bulk', () => {
            it('should delete multiple tab groups', async () => {
                const { agent, user } = await authenticateAgent(app);

                const [tab1] = await db('tabs')
                    .insert({ user_id: user.id, title: 'Tab 1', trigger: '!tab1' })
                    .returning('*');
                const [tab2] = await db('tabs')
                    .insert({ user_id: user.id, title: 'Tab 2', trigger: '!tab2' })
                    .returning('*');

                await agent
                    .post('/tabs/delete-bulk')
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
                    .post('/tabs/delete-bulk')
                    .send({ id: [userTab.id.toString(), otherTab.id.toString()] })
                    .expect(302);

                const userTabs = await db('tabs').where({ user_id: user.id });
                expect(userTabs).toHaveLength(0);

                const otherTabs = await db('tabs').where({ user_id: otherUser.id });
                expect(otherTabs).toHaveLength(1);
            });

            it('should require id array', async () => {
                const { agent } = await authenticateAgent(app);

                await agent.post('/tabs/delete-bulk').type('form').send({}).expect(302);
            });
        });

        describe('POST /api/tabs/delete-bulk', () => {
            it('should delete multiple tab groups via API', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                const [tab1] = await db('tabs')
                    .insert({ user_id: user.id, title: 'Tab 1', trigger: '!tab1' })
                    .returning('*');
                const [tab2] = await db('tabs')
                    .insert({ user_id: user.id, title: 'Tab 2', trigger: '!tab2' })
                    .returning('*');

                const response = await agent
                    .post('/api/tabs/delete-bulk')
                    .send({ id: [tab1.id.toString(), tab2.id.toString()] })
                    .expect(200);

                expect(response.body.message).toContain('2 tab groups deleted successfully');
                expect(response.body.data.deletedCount).toBe(2);

                const remainingTabs = await db('tabs').where({ user_id: user.id });
                expect(remainingTabs).toHaveLength(0);
            });

            it('should return correct count when some IDs are invalid', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                const [tab1] = await db('tabs')
                    .insert({ user_id: user.id, title: 'Tab 1', trigger: '!tab1' })
                    .returning('*');

                const response = await agent
                    .post('/api/tabs/delete-bulk')
                    .send({ id: [tab1.id.toString(), '99999'] })
                    .expect(200);

                expect(response.body.data.deletedCount).toBe(1);
            });

            it('should require id to be an array', async () => {
                const { agent } = await authenticateApiAgent(app);

                await agent.post('/api/tabs/delete-bulk').send({ id: 'not-an-array' }).expect(422);
            });
        });
    });
});
