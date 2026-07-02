import { authenticateAgent } from '../../tests/test-utils.js';
import { db, app } from '../../tests/test-setup.js';
import { describe, it, expect } from 'vite-plus/test';

describe('Actions Routes', () => {
    describe('Hidden Actions Functionality', () => {
        describe('POST /actions/:id/update - Update hidden field', () => {
            it('should reject hiding action without global password', async () => {
                const { agent, user } = await authenticateAgent(app);

                const [action] = await db('bangs')
                    .insert({
                        user_id: user.id,
                        name: 'Test Action',
                        trigger: '!test2',
                        url: 'https://example.com',
                        action_type: 'redirect',
                        hidden: false,
                    })
                    .returning('*');

                await agent
                    .post(`/actions/${action.id}/update`)
                    .type('form')
                    .send({
                        name: 'Test Action',
                        trigger: '!test2',
                        url: 'https://example.com',
                        actionType: 'redirect',
                        hidden: 'on',
                    })
                    .expect(302);

                const action2 = await db('bangs').where({ id: action.id }).first();
                expect(action2.hidden).toBe(0);
            });
        });

        describe('POST /actions/:id/hide - Toggle hidden status', () => {
            it('should toggle hidden status when global password is set', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                const [action] = await db('bangs')
                    .insert({
                        user_id: user.id,
                        name: 'Test Action',
                        trigger: '!test',
                        url: 'https://example.com',
                        action_type: 'redirect',
                        hidden: false,
                    })
                    .returning('*');

                await agent.post(`/actions/${action.id}/hide`).type('form').send({}).expect(302);

                const updatedAction = await db('bangs').where({ id: action.id }).first();
                expect(updatedAction.hidden).toBe(1);

                await agent.post(`/actions/${action.id}/hide`).type('form').send({}).expect(302);

                const unhiddenAction = await db('bangs').where({ id: action.id }).first();
                expect(unhiddenAction.hidden).toBe(0);
            });

            it('should reject hiding action without global password', async () => {
                const { agent, user } = await authenticateAgent(app);

                const [action] = await db('bangs')
                    .insert({
                        user_id: user.id,
                        name: 'Test Action',
                        trigger: '!test',
                        url: 'https://example.com',
                        action_type: 'redirect',
                        hidden: false,
                    })
                    .returning('*');

                await agent.post(`/actions/${action.id}/hide`).type('form').send({}).expect(302);

                const unchangedAction = await db('bangs').where({ id: action.id }).first();
                expect(unchangedAction.hidden).toBe(0);
            });

            it('should reject hiding non-redirect type action', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                const [action] = await db('bangs')
                    .insert({
                        user_id: user.id,
                        name: 'Search Action',
                        trigger: '!search',
                        url: 'https://example.com/search?q={{query}}',
                        action_type: 'search',
                        hidden: false,
                    })
                    .returning('*');

                await agent.post(`/actions/${action.id}/hide`).type('form').send({}).expect(302);

                const unchangedAction = await db('bangs').where({ id: action.id }).first();
                expect(unchangedAction.hidden).toBe(0);
            });

            it('should preserve showHidden query param in redirect', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                const [action] = await db('bangs')
                    .insert({
                        user_id: user.id,
                        name: 'Test Action',
                        trigger: '!test',
                        url: 'https://example.com',
                        action_type: 'redirect',
                        hidden: true,
                    })
                    .returning('*');

                const response = await agent
                    .post(`/actions/${action.id}/hide`)
                    .type('form')
                    .send({ showHidden: 'true' })
                    .expect(302);

                expect(response.headers.location).toBe('/actions?hidden=true');
            });

            it('should return 404 for non-existent action', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                await agent.post('/actions/99999/hide').type('form').send({}).expect(404);
            });
        });
    });

    describe('POST /actions/delete', () => {
        it('should delete multiple actions', async () => {
            const { agent, user } = await authenticateAgent(app);

            const actions = await db('bangs')
                .insert([
                    {
                        user_id: user.id,
                        name: 'Action 1',
                        trigger: '!one',
                        url: 'https://one.com',
                        action_type: 'redirect',
                    },
                    {
                        user_id: user.id,
                        name: 'Action 2',
                        trigger: '!two',
                        url: 'https://two.com',
                        action_type: 'search',
                    },
                    {
                        user_id: user.id,
                        name: 'Action 3',
                        trigger: '!three',
                        url: 'https://three.com',
                        action_type: 'redirect',
                    },
                ])
                .returning('*');

            await agent
                .post('/actions/delete')
                .type('form')
                .send({ id: [actions[0].id, actions[1].id] })
                .expect(302);

            const remaining = await db('bangs').where({ user_id: user.id });
            expect(remaining).toHaveLength(1);
            expect(remaining[0].name).toBe('Action 3');
        });

        it('should only delete actions owned by the user', async () => {
            const { agent, user } = await authenticateAgent(app);

            const [otherUser] = await db('users')
                .insert({
                    username: 'otheruser',
                    email: 'other@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                })
                .returning('*');

            const [userAction] = await db('bangs')
                .insert({
                    user_id: user.id,
                    name: 'My Action',
                    trigger: '!mine',
                    url: 'https://mine.com',
                    action_type: 'redirect',
                })
                .returning('*');

            const [otherAction] = await db('bangs')
                .insert({
                    user_id: otherUser.id,
                    name: 'Other Action',
                    trigger: '!other',
                    url: 'https://other.com',
                    action_type: 'redirect',
                })
                .returning('*');

            await agent
                .post('/actions/delete')
                .type('form')
                .send({ id: [userAction.id, otherAction.id] })
                .expect(302);

            const userActions = await db('bangs').where({ user_id: user.id });
            const otherActions = await db('bangs').where({ user_id: otherUser.id });

            expect(userActions).toHaveLength(0);
            expect(otherActions).toHaveLength(1);
        });

        it('should require id array', async () => {
            const { agent } = await authenticateAgent(app);

            await agent.post('/actions/delete').type('form').send({}).expect(302);
        });
    });

    describe('Search Highlighting', () => {
        it('should highlight search terms in name, trigger and url', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('bangs').insert([
                {
                    user_id: user.id,
                    name: 'Google Search',
                    trigger: '!google',
                    url: 'https://google.com/search?q={{{s}}}',
                    action_type: 'redirect',
                },
                {
                    user_id: user.id,
                    name: 'Other Action',
                    trigger: '!other',
                    url: 'https://other.com',
                    action_type: 'redirect',
                },
            ]);

            const response = await agent.get('/actions?search=google').expect(200);

            expect(response.text).toContain('<mark>Google</mark> Search');
            expect(response.text).toContain('!<mark>google</mark>');
            expect(response.text).toContain('https://<mark>google</mark>.com');
            expect(response.text).not.toContain('Other Action');
        });

        it('should highlight multiple search words', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('bangs').insert({
                user_id: user.id,
                name: 'GitHub Code Search',
                trigger: '!ghcode',
                url: 'https://github.com/search?q={{{s}}}',
                action_type: 'redirect',
            });

            const response = await agent.get('/actions?search=github+code').expect(200);

            expect(response.text).toContain('<mark>GitHub</mark>');
            expect(response.text).toContain('<mark>Code</mark>');
        });

        it('should return all results without highlighting when no search term', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('bangs').insert([
                {
                    user_id: user.id,
                    name: 'Action One',
                    trigger: '!one',
                    url: 'https://one.com',
                    action_type: 'redirect',
                },
                {
                    user_id: user.id,
                    name: 'Action Two',
                    trigger: '!two',
                    url: 'https://two.com',
                    action_type: 'redirect',
                },
            ]);

            const response = await agent.get('/actions').expect(200);

            expect(response.text).toContain('Action One');
            expect(response.text).toContain('Action Two');
            expect(response.text).not.toContain('<mark>');
        });
    });
});
