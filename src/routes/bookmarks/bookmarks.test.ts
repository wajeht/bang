import {
    cleanupTestData,
    authenticateAgent,
    cleanupTestDatabase,
    authenticateApiAgent,
} from '../../tests/api-test-utils';
import request from 'supertest';
import { db } from '../../db/db';
import { createApp } from '../../app';
import { describe, it, expect, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';

describe('Bookmarks Routes', () => {
    let app: any;

    beforeAll(async () => {
        await db.migrate.latest();
    });

    beforeEach(async () => {
        app = await createApp();
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
});
