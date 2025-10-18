import {
    cleanupTestData,
    authenticateAgent,
    cleanupTestDatabase,
    authenticateApiAgent,
} from '../../tests/api-test-utils';
import { db } from '../../tests/test-setup';
import { createApp } from '../../app';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

describe('Bookmarks Routes', () => {
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

    describe('Hidden Items Functionality', () => {
        describe('POST /bookmarks - Hidden field', () => {
            it('should reject creating hidden bookmark without global password', async () => {
                const { agent, user } = await authenticateAgent(app);

                await agent
                    .post('/bookmarks')
                    .type('form')
                    .send({
                        title: 'Hidden Bookmark',
                        url: 'https://example.com',
                        hidden: 'on',
                    })
                    .expect(302);

                const bookmark = await db('bookmarks').where({ user_id: user.id }).first();
                expect(bookmark).toBeUndefined();
            });

            it('should create hidden bookmark when global password is set', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                await agent
                    .post('/bookmarks')
                    .type('form')
                    .send({
                        title: 'Hidden Bookmark',
                        url: 'https://example.com',
                        hidden: 'on',
                    })
                    .expect(302);

                await new Promise((resolve) => setTimeout(resolve, 100));

                const bookmark = await db('bookmarks').where({ user_id: user.id }).first();
                expect(bookmark).toBeDefined();
                expect(bookmark.title).toBe('Hidden Bookmark');
                expect(bookmark.hidden).toBe(1);
            });

            it('should exclude hidden bookmarks from listing', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                await db('bookmarks').insert([
                    {
                        user_id: user.id,
                        title: 'Public Bookmark',
                        url: 'https://public.com',
                        hidden: false,
                    },
                    {
                        user_id: user.id,
                        title: 'Hidden Bookmark',
                        url: 'https://secret.com',
                        hidden: true,
                    },
                ]);

                const response = await agent.get('/bookmarks').expect(200);
                expect(response.text).toContain('Public Bookmark');
                expect(response.text).not.toContain('Hidden Bookmark');
            });
        });

        describe('POST /api/bookmarks - Hidden field via API', () => {
            it('should reject creating hidden bookmark without global password via API', async () => {
                const { agent } = await authenticateApiAgent(app);

                const response = await agent
                    .post('/api/bookmarks')
                    .send({
                        title: 'Hidden Bookmark',
                        url: 'https://example.com',
                        hidden: true,
                    })
                    .expect(422);

                expect(response.body.message).toContain('Validation');
            });

            it('should create hidden bookmark with global password via API', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                const response = await agent
                    .post('/api/bookmarks')
                    .send({
                        title: 'Hidden API Bookmark',
                        url: 'https://secret.com',
                        hidden: true,
                    })
                    .expect(201);

                expect(response.body.message).toContain('created successfully');

                await new Promise((resolve) => setTimeout(resolve, 100));

                const bookmark = await db('bookmarks').where({ user_id: user.id }).first();
                expect(bookmark).toBeDefined();
                expect(bookmark?.hidden).toBe(1);
            });
        });

        describe('POST /bookmarks/:id/update - Update hidden field', () => {
            it('should allow toggling hidden status with global password', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                const [bookmark] = await db('bookmarks')
                    .insert({
                        user_id: user.id,
                        title: 'Test Bookmark',
                        url: 'https://example.com',
                        hidden: false,
                    })
                    .returning('*');

                await agent
                    .post(`/bookmarks/${bookmark.id}/update`)
                    .type('form')
                    .send({
                        title: 'Test Bookmark',
                        url: 'https://example.com',
                        hidden: 'on',
                    })
                    .expect(302);

                const updatedBookmark = await db('bookmarks').where({ id: bookmark.id }).first();
                expect(updatedBookmark.hidden).toBe(1);
            });

            it('should reject hiding bookmark without global password', async () => {
                const { agent, user } = await authenticateAgent(app);

                const [bookmark] = await db('bookmarks')
                    .insert({
                        user_id: user.id,
                        title: 'Test Bookmark',
                        url: 'https://example.com',
                        hidden: false,
                    })
                    .returning('*');

                await agent
                    .post(`/bookmarks/${bookmark.id}/update`)
                    .type('form')
                    .send({
                        title: 'Test Bookmark',
                        url: 'https://example.com',
                        hidden: 'on',
                    })
                    .expect(302); // Will redirect with error flash message

                const bookmark2 = await db('bookmarks').where({ id: bookmark.id }).first();
                expect(bookmark2.hidden).toBe(0);
            });
        });

        describe('GET /api/bookmarks - Hidden bookmarks exclusion', () => {
            it('should exclude hidden bookmarks from API listing', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                await db('bookmarks').insert([
                    {
                        user_id: user.id,
                        title: 'Public Bookmark',
                        url: 'https://public.com',
                        hidden: false,
                    },
                    {
                        user_id: user.id,
                        title: 'Hidden Bookmark',
                        url: 'https://secret.com',
                        hidden: true,
                    },
                ]);

                const response = await agent.get('/api/bookmarks').expect(200);

                expect(response.body.data).toHaveLength(1);
                expect(response.body.data[0].title).toBe('Public Bookmark');
            });
        });

        describe('POST /api/bookmarks/:id/pin - Pin/unpin with hidden bookmarks', () => {
            it('should toggle pin status for hidden bookmark with global password via API', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                const [bookmark] = await db('bookmarks')
                    .insert({
                        user_id: user.id,
                        title: 'Hidden Bookmark',
                        url: 'https://secret.com',
                        hidden: true,
                        pinned: false,
                    })
                    .returning('*');

                const response = await agent.post(`/api/bookmarks/${bookmark.id}/pin`).expect(200);

                expect(response.body.message).toContain('pinned successfully');

                const updatedBookmark = await db('bookmarks').where({ id: bookmark.id }).first();
                expect(updatedBookmark.pinned).toBe(1);
                expect(updatedBookmark.hidden).toBe(1); // Should remain hidden
            });
        });
    });

    describe('POST /bookmarks/delete-bulk', () => {
        it('should delete multiple bookmarks', async () => {
            const { agent, user } = await authenticateAgent(app);

            const bookmarks = await db('bookmarks')
                .insert([
                    { user_id: user.id, title: 'Bookmark 1', url: 'https://one.com' },
                    { user_id: user.id, title: 'Bookmark 2', url: 'https://two.com' },
                    { user_id: user.id, title: 'Bookmark 3', url: 'https://three.com' },
                ])
                .returning('*');

            await agent
                .post('/bookmarks/delete-bulk')
                .type('form')
                .send({ id: [bookmarks[0].id, bookmarks[1].id] })
                .expect(302);

            const remaining = await db('bookmarks').where({ user_id: user.id });
            expect(remaining).toHaveLength(1);
            expect(remaining[0].title).toBe('Bookmark 3');
        });

        it('should only delete bookmarks owned by the user', async () => {
            const { agent, user } = await authenticateAgent(app);

            const [otherUser] = await db('users')
                .insert({
                    username: 'otheruser',
                    email: 'other@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                })
                .returning('*');

            const [userBookmark] = await db('bookmarks')
                .insert({ user_id: user.id, title: 'My Bookmark', url: 'https://mine.com' })
                .returning('*');

            const [otherBookmark] = await db('bookmarks')
                .insert({
                    user_id: otherUser.id,
                    title: 'Other Bookmark',
                    url: 'https://other.com',
                })
                .returning('*');

            await agent
                .post('/bookmarks/delete-bulk')
                .type('form')
                .send({ id: [userBookmark.id, otherBookmark.id] })
                .expect(302);

            const userBookmarks = await db('bookmarks').where({ user_id: user.id });
            const otherBookmarks = await db('bookmarks').where({ user_id: otherUser.id });

            expect(userBookmarks).toHaveLength(0);
            expect(otherBookmarks).toHaveLength(1);
        });

        it('should require id array', async () => {
            const { agent } = await authenticateAgent(app);

            await agent.post('/bookmarks/delete-bulk').type('form').send({}).expect(302);
        });
    });

    describe('POST /api/bookmarks/delete-bulk', () => {
        it('should delete multiple bookmarks via API', async () => {
            const { agent, user } = await authenticateApiAgent(app);

            const bookmarks = await db('bookmarks')
                .insert([
                    { user_id: user.id, title: 'Bookmark 1', url: 'https://one.com' },
                    { user_id: user.id, title: 'Bookmark 2', url: 'https://two.com' },
                    { user_id: user.id, title: 'Bookmark 3', url: 'https://three.com' },
                ])
                .returning('*');

            const response = await agent
                .post('/api/bookmarks/delete-bulk')
                .send({ id: [bookmarks[0].id, bookmarks[1].id] })
                .expect(200);

            expect(response.body.message).toContain('2 bookmarks deleted successfully');
            expect(response.body.data.deletedCount).toBe(2);

            const remaining = await db('bookmarks').where({ user_id: user.id });
            expect(remaining).toHaveLength(1);
            expect(remaining[0].title).toBe('Bookmark 3');
        });

        it('should return correct count when some IDs are invalid', async () => {
            const { agent, user } = await authenticateApiAgent(app);

            const [bookmark] = await db('bookmarks')
                .insert({ user_id: user.id, title: 'Bookmark 1', url: 'https://one.com' })
                .returning('*');

            const response = await agent
                .post('/api/bookmarks/delete-bulk')
                .send({ id: [bookmark.id, 99999] })
                .expect(200);

            expect(response.body.data.deletedCount).toBe(1);
        });

        it('should require id to be an array', async () => {
            const { agent } = await authenticateApiAgent(app);

            await agent.post('/api/bookmarks/delete-bulk').send({ id: 'not-an-array' }).expect(422);
        });
    });
});
