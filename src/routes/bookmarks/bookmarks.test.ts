import {
    cleanupTestData,
    authenticateAgent,
    cleanupTestDatabase,
    authenticateApiAgent,
    getSharedApp,
} from '../../tests/api-test-utils';
import { db } from '../../tests/test-setup';
import { describe, it, expect, beforeAll, afterEach, afterAll, vi } from 'vitest';

describe('Bookmarks Routes', () => {
    let app: any;

    beforeAll(async () => {
        ({ app } = await getSharedApp());
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

                const bookmark = await vi.waitFor(
                    async () => {
                        const result = await db('bookmarks').where({ user_id: user.id }).first();
                        expect(result).toBeDefined();
                        return result;
                    },
                    { timeout: 1000 },
                );
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

                const bookmark = await vi.waitFor(
                    async () => {
                        const result = await db('bookmarks').where({ user_id: user.id }).first();
                        expect(result).toBeDefined();
                        return result;
                    },
                    { timeout: 1000 },
                );
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

        describe('POST /bookmarks/:id/hide - Toggle hidden status', () => {
            it('should toggle hidden status when global password is set', async () => {
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
                    .post(`/bookmarks/${bookmark.id}/hide`)
                    .type('form')
                    .send({})
                    .expect(302);

                const updatedBookmark = await db('bookmarks').where({ id: bookmark.id }).first();
                expect(updatedBookmark.hidden).toBe(1);

                await agent
                    .post(`/bookmarks/${bookmark.id}/hide`)
                    .type('form')
                    .send({})
                    .expect(302);

                const unhiddenBookmark = await db('bookmarks').where({ id: bookmark.id }).first();
                expect(unhiddenBookmark.hidden).toBe(0);
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
                    .post(`/bookmarks/${bookmark.id}/hide`)
                    .type('form')
                    .send({})
                    .expect(302);

                const unchangedBookmark = await db('bookmarks').where({ id: bookmark.id }).first();
                expect(unchangedBookmark.hidden).toBe(0);
            });

            it('should preserve showHidden query param in redirect', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                const [bookmark] = await db('bookmarks')
                    .insert({
                        user_id: user.id,
                        title: 'Test Bookmark',
                        url: 'https://example.com',
                        hidden: true,
                    })
                    .returning('*');

                const response = await agent
                    .post(`/bookmarks/${bookmark.id}/hide`)
                    .type('form')
                    .send({ showHidden: 'true' })
                    .expect(302);

                expect(response.headers.location).toBe('/bookmarks?hidden=true');
            });

            it('should return 404 for non-existent bookmark', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                await agent.post('/bookmarks/99999/hide').type('form').send({}).expect(404);
            });
        });

        describe('POST /api/bookmarks/:id/hide - Toggle hidden status via API', () => {
            it('should toggle hidden status via API when global password is set', async () => {
                const { agent, user } = await authenticateApiAgent(app);

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

                const response = await agent.post(`/api/bookmarks/${bookmark.id}/hide`).expect(200);

                expect(response.body.message).toContain('hidden successfully');

                const updatedBookmark = await db('bookmarks').where({ id: bookmark.id }).first();
                expect(updatedBookmark.hidden).toBe(1);
            });

            it('should reject hiding via API without global password', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                const [bookmark] = await db('bookmarks')
                    .insert({
                        user_id: user.id,
                        title: 'Test Bookmark',
                        url: 'https://example.com',
                        hidden: false,
                    })
                    .returning('*');

                const response = await agent.post(`/api/bookmarks/${bookmark.id}/hide`).expect(422);

                expect(response.body.message).toContain('Validation');

                const unchangedBookmark = await db('bookmarks').where({ id: bookmark.id }).first();
                expect(unchangedBookmark.hidden).toBe(0);
            });

            it('should return 404 for non-existent bookmark via API', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                await agent.post('/api/bookmarks/99999/hide').expect(404);
            });
        });
    });

    describe('POST /bookmarks/delete', () => {
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
                .post('/bookmarks/delete')
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
                .post('/bookmarks/delete')
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

            await agent.post('/bookmarks/delete').type('form').send({}).expect(302);
        });
    });

    describe('POST /api/bookmarks/delete', () => {
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
                .post('/api/bookmarks/delete')
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
                .post('/api/bookmarks/delete')
                .send({ id: [bookmark.id, 99999] })
                .expect(200);

            expect(response.body.data.deletedCount).toBe(1);
        });

        it('should require id to be an array', async () => {
            const { agent } = await authenticateApiAgent(app);

            await agent.post('/api/bookmarks/delete').send({ id: 'not-an-array' }).expect(422);
        });
    });

    describe('Duplicate Bookmark Detection', () => {
        describe('POST /bookmarks - Same URL with different title', () => {
            it('should allow creating bookmark with same URL but different title', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('bookmarks').insert({
                    user_id: user.id,
                    title: 'Original Title',
                    url: 'https://example.com',
                });

                await agent
                    .post('/bookmarks')
                    .type('form')
                    .send({
                        title: 'Different Title',
                        url: 'https://example.com',
                    })
                    .expect(302);

                const bookmarks = await vi.waitFor(
                    async () => {
                        const result = await db('bookmarks').where({ user_id: user.id });
                        expect(result.length).toBe(2);
                        return result;
                    },
                    { timeout: 1000 },
                );

                expect(bookmarks.map((b: any) => b.title).sort()).toEqual([
                    'Different Title',
                    'Original Title',
                ]);
            });

            it('should reject creating bookmark with same URL and same title', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('bookmarks').insert({
                    user_id: user.id,
                    title: 'Same Title',
                    url: 'https://example.com',
                });

                await agent
                    .post('/bookmarks')
                    .type('form')
                    .send({
                        title: 'Same Title',
                        url: 'https://example.com',
                    })
                    .expect(302);

                const bookmarks = await db('bookmarks').where({ user_id: user.id });
                expect(bookmarks).toHaveLength(1);
            });

            it('should check URL only when no title is provided', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('bookmarks').insert({
                    user_id: user.id,
                    title: 'Existing Title',
                    url: 'https://example.com',
                });

                await agent
                    .post('/bookmarks')
                    .type('form')
                    .send({
                        url: 'https://example.com',
                    })
                    .expect(302);

                const bookmarks = await db('bookmarks').where({ user_id: user.id });
                expect(bookmarks).toHaveLength(1);
            });
        });

        describe('POST /api/bookmarks - Same URL with different title via API', () => {
            it('should allow creating bookmark with same URL but different title via API', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                await db('bookmarks').insert({
                    user_id: user.id,
                    title: 'Original Title',
                    url: 'https://example.com',
                });

                const response = await agent
                    .post('/api/bookmarks')
                    .send({
                        title: 'Different Title',
                        url: 'https://example.com',
                    })
                    .expect(201);

                expect(response.body.message).toContain('created successfully');

                const bookmarks = await vi.waitFor(
                    async () => {
                        const result = await db('bookmarks').where({ user_id: user.id });
                        expect(result.length).toBe(2);
                        return result;
                    },
                    { timeout: 1000 },
                );

                expect(bookmarks.map((b: any) => b.title).sort()).toEqual([
                    'Different Title',
                    'Original Title',
                ]);
            });

            it('should reject creating bookmark with same URL and same title via API', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                await db('bookmarks').insert({
                    user_id: user.id,
                    title: 'Same Title',
                    url: 'https://example.com',
                });

                const response = await agent
                    .post('/api/bookmarks')
                    .send({
                        title: 'Same Title',
                        url: 'https://example.com',
                    })
                    .expect(422);

                expect(response.body.message).toContain('Validation');

                const bookmarks = await db('bookmarks').where({ user_id: user.id });
                expect(bookmarks).toHaveLength(1);
            });
        });
    });

    describe('Search Highlighting', () => {
        it('should highlight search terms in title and url', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('bookmarks').insert([
                {
                    user_id: user.id,
                    title: 'Crypto Wallet',
                    url: 'https://crypto-wallet.example.com',
                },
                { user_id: user.id, title: 'Other Bookmark', url: 'https://other.com' },
            ]);

            const response = await agent.get('/bookmarks?search=cry').expect(200);

            expect(response.text).toContain('<mark>Cry</mark>pto Wallet');
            expect(response.text).toContain('https://<mark>cry</mark>pto-wallet.example.com');
            expect(response.text).not.toContain('Other Bookmark');
        });

        it('should highlight multiple search words', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('bookmarks').insert({
                user_id: user.id,
                title: 'My Favorite Website',
                url: 'https://favorite-site.com',
            });

            const response = await agent.get('/bookmarks?search=favorite+site').expect(200);

            expect(response.text).toContain('<mark>Favorite</mark>');
            expect(response.text).toContain('<mark>site</mark>');
        });

        it('should return all results without highlighting when no search term', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('bookmarks').insert([
                { user_id: user.id, title: 'Bookmark One', url: 'https://one.com' },
                { user_id: user.id, title: 'Bookmark Two', url: 'https://two.com' },
            ]);

            const response = await agent.get('/bookmarks').expect(200);

            expect(response.text).toContain('Bookmark One');
            expect(response.text).toContain('Bookmark Two');
            expect(response.text).not.toContain('<mark>');
        });

        it('should highlight search terms in API response', async () => {
            const { agent, user } = await authenticateApiAgent(app);

            await db('bookmarks').insert({
                user_id: user.id,
                title: 'Testing Highlight',
                url: 'https://highlight-test.com',
            });

            const response = await agent.get('/api/bookmarks?search=highlight').expect(200);

            expect(response.body.data[0].title).toContain('<mark>Highlight</mark>');
            expect(response.body.data[0].url).toContain('<mark>highlight</mark>');
        });
    });
});
