import {
    cleanupTestData,
    authenticateAgent,
    cleanupTestDatabase,
    authenticateApiAgent,
    createUnauthenticatedAgent,
} from '../../tests/api-test-utils';
import request from 'supertest';
import { createApp } from '../../app';
import { db } from '../../tests/test-setup';
import { describe, it, expect, beforeEach, afterEach, afterAll } from 'vitest';

describe('Notes Routes', () => {
    let app: any;

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

    describe('GET /notes', () => {
        it('should require authentication', async () => {
            await request(app).get('/notes').expect(302).expect('Location', '/?modal=login');
        });

        it('should return notes list for authenticated users', async () => {
            const { agent } = await authenticateAgent(app);

            const response = await agent.get('/notes').expect(200);
            expect(response.text).toContain('Notes');
        });

        it('should return empty list when user has no notes', async () => {
            const { agent } = await authenticateAgent(app);

            const response = await agent.get('/notes').expect(200);
            expect(response.text).toContain('Notes');
        });
    });

    describe('GET /api/notes', () => {
        it('should require authentication', async () => {
            await request(app).get('/api/notes').set('Accept', 'application/json').expect(401);
        });

        it('should return notes as JSON', async () => {
            const { agent, user } = await authenticateApiAgent(app);

            await db('notes').insert({
                user_id: user.id,
                title: 'Test Note',
                content: 'Test content',
                pinned: false,
            });

            const response = await agent.get('/api/notes').expect(200);

            expect(response.body.data).toBeInstanceOf(Array);
            expect(response.body.data).toHaveLength(1);
            expect(response.body.data[0].title).toBe('Test Note');
        });
    });

    describe('GET /notes/create', () => {
        it('should require authentication', async () => {
            await request(app).get('/notes/create').expect(302).expect('Location', '/?modal=login');
        });

        it('should render create note page for authenticated users', async () => {
            const { agent } = await authenticateAgent(app);

            const response = await agent.get('/notes/create').expect(200);
            expect(response.text).toContain('Create');
        });
    });

    describe('POST /notes', () => {
        it('should require authentication', async () => {
            const agent = await createUnauthenticatedAgent(app);
            await agent
                .post('/notes')
                .type('form')
                .send({
                    title: 'New Note',
                    content: 'New content',
                })
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should create a new note', async () => {
            const { agent, user } = await authenticateAgent(app);

            await agent
                .post('/notes')
                .type('form')
                .send({
                    title: 'New Note',
                    content: 'New content',
                    pinned: 'on',
                })
                .expect(302);

            const note = await db('notes').where({ user_id: user.id }).first();
            expect(note).toBeDefined();
            expect(note.title).toBe('New Note');
            expect(note.content).toBe('New content');
            expect(note.pinned).toBe(1);
        });

        it('should validate required fields', async () => {
            const { agent } = await authenticateAgent(app);

            await agent
                .post('/notes')
                .type('form')
                .send({
                    content: 'Content without title',
                })
                .expect(302);
        });
    });

    describe('POST /api/notes', () => {
        it('should create a new note via API', async () => {
            const { agent, user } = await authenticateApiAgent(app);

            const response = await agent
                .post('/api/notes')
                .send({
                    title: 'API Note',
                    content: 'API content',
                    pinned: true,
                })
                .expect(201);

            expect(response.body.message).toContain('created successfully');

            const note = await db('notes').where({ user_id: user.id, title: 'API Note' }).first();
            expect(note).toBeDefined();
            expect(note.content).toBe('API content');
            expect(note.pinned).toBe(1);
        });
    });

    describe('GET /notes/:id', () => {
        it('should require authentication', async () => {
            await request(app).get('/notes/1').expect(302).expect('Location', '/?modal=login');
        });

        it('should return 404 for non-existent note', async () => {
            const { agent } = await authenticateAgent(app);

            await agent.get('/notes/99999').expect(404);
        });

        it('should return note details for owner', async () => {
            const { agent, user } = await authenticateAgent(app);

            const [note] = await db('notes')
                .insert({
                    user_id: user.id,
                    title: 'Test Note',
                    content: 'Test content',
                    pinned: false,
                })
                .returning('*');

            const response = await agent.get(`/notes/${note.id}`).expect(200);
            expect(response.text).toContain('Test Note');
            expect(response.text).toContain('Test content');
        });

        it('should not allow viewing notes from other users', async () => {
            const { agent } = await authenticateAgent(app);

            const [otherUser] = await db('users')
                .insert({
                    username: 'otheruser',
                    email: 'other@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                })
                .returning('*');

            const [note] = await db('notes')
                .insert({
                    user_id: otherUser.id,
                    title: 'Other User Note',
                    content: 'Other content',
                    pinned: false,
                })
                .returning('*');

            await agent.get(`/notes/${note.id}`).expect(404);
        });
    });

    describe('GET /notes/:id/edit', () => {
        it('should require authentication', async () => {
            await request(app).get('/notes/1/edit').expect(302).expect('Location', '/?modal=login');
        });

        it('should render edit page for note owner', async () => {
            const { agent, user } = await authenticateAgent(app);

            const [note] = await db('notes')
                .insert({
                    user_id: user.id,
                    title: 'Test Note',
                    content: 'Test content',
                    pinned: false,
                })
                .returning('*');

            const response = await agent.get(`/notes/${note.id}/edit`).expect(200);
            expect(response.text).toContain('Edit');
            expect(response.text).toContain('Test Note');
        });
    });

    describe('POST /notes/:id/update', () => {
        it('should require authentication', async () => {
            const agent = await createUnauthenticatedAgent(app);
            await agent
                .post('/notes/1/update')
                .type('form')
                .send({
                    title: 'Updated Note',
                    content: 'Updated content',
                })
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should update note for owner', async () => {
            const { agent, user } = await authenticateAgent(app);

            const [note] = await db('notes')
                .insert({
                    user_id: user.id,
                    title: 'Original Title',
                    content: 'Original content',
                    pinned: false,
                })
                .returning('*');

            await agent
                .post(`/notes/${note.id}/update`)
                .type('form')
                .send({
                    title: 'Updated Title',
                    content: 'Updated content',
                    pinned: 'on',
                })
                .expect(302);

            const updatedNote = await db('notes').where({ id: note.id }).first();
            expect(updatedNote.title).toBe('Updated Title');
            expect(updatedNote.content).toBe('Updated content');
            expect(updatedNote.pinned).toBe(1);
        });

        it('should not allow updating notes from other users', async () => {
            const { agent } = await authenticateAgent(app);

            const [otherUser] = await db('users')
                .insert({
                    username: 'otheruser2',
                    email: 'other2@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                })
                .returning('*');

            const [note] = await db('notes')
                .insert({
                    user_id: otherUser.id,
                    title: 'Other User Note',
                    content: 'Other content',
                    pinned: false,
                })
                .returning('*');

            const response = await agent.post(`/notes/${note.id}/update`).type('form').send({
                title: 'Hacked Title',
                content: 'Hacked content',
            });

            expect([302, 403, 404, 500].includes(response.status)).toBe(true);

            const unchangedNote = await db('notes').where({ id: note.id }).first();
            expect(unchangedNote.title).toBe('Other User Note');
        });
    });

    describe('POST /notes/:id/delete', () => {
        it('should require authentication', async () => {
            const agent = await createUnauthenticatedAgent(app);
            await agent
                .post('/notes/1/delete')
                .type('form')
                .send({})
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should delete note for owner', async () => {
            const { agent, user } = await authenticateAgent(app);

            const [note] = await db('notes')
                .insert({
                    user_id: user.id,
                    title: 'To Delete',
                    content: 'Will be deleted',
                    pinned: false,
                })
                .returning('*');

            await agent.post(`/notes/${note.id}/delete`).type('form').send({}).expect(302);

            const deletedNote = await db('notes').where({ id: note.id }).first();
            expect(deletedNote).toBeUndefined();
        });

        it('should not allow deleting notes from other users', async () => {
            const { agent } = await authenticateAgent(app);

            const [otherUser] = await db('users')
                .insert({
                    username: 'otheruser3',
                    email: 'other3@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                })
                .returning('*');

            const [note] = await db('notes')
                .insert({
                    user_id: otherUser.id,
                    title: 'Other User Note',
                    content: 'Other content',
                    pinned: false,
                })
                .returning('*');

            await agent.post(`/notes/${note.id}/delete`).type('form').send({}).expect(404);

            const stillExists = await db('notes').where({ id: note.id }).first();
            expect(stillExists).toBeDefined();
        });
    });

    describe('POST /notes/:id/pin', () => {
        it('should require authentication', async () => {
            const agent = await createUnauthenticatedAgent(app);
            await agent
                .post('/notes/1/pin')
                .type('form')
                .send({})
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should toggle pin status for note owner', async () => {
            const { agent, user } = await authenticateAgent(app);

            const [note] = await db('notes')
                .insert({
                    user_id: user.id,
                    title: 'Test Note',
                    content: 'Test content',
                    pinned: false,
                })
                .returning('*');

            await agent.post(`/notes/${note.id}/pin`).type('form').send({}).expect(302);

            let updatedNote = await db('notes').where({ id: note.id }).first();
            expect(updatedNote.pinned).toBe(1);

            await agent.post(`/notes/${note.id}/pin`).type('form').send({}).expect(302);

            updatedNote = await db('notes').where({ id: note.id }).first();
            expect(updatedNote.pinned).toBe(0);
        });

        it('should not allow pinning notes from other users', async () => {
            const { agent } = await authenticateAgent(app);

            const [otherUser] = await db('users')
                .insert({
                    username: 'otheruser4',
                    email: 'other4@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                })
                .returning('*');

            const [note] = await db('notes')
                .insert({
                    user_id: otherUser.id,
                    title: 'Other User Note',
                    content: 'Other content',
                    pinned: false,
                })
                .returning('*');

            await agent.post(`/notes/${note.id}/pin`).type('form').send({}).expect(404);

            const unchangedNote = await db('notes').where({ id: note.id }).first();
            expect(unchangedNote.pinned).toBe(0);
        });
    });

    describe('GET /notes/:id/download', () => {
        it('should require authentication', async () => {
            await request(app)
                .get('/notes/1/download')
                .expect(302)
                .expect('Location', '/?modal=login');
        });

        it('should return 404 for non-existent note', async () => {
            const { agent } = await authenticateAgent(app);

            await agent.get('/notes/99999/download').expect(404);
        });

        it('should download note as markdown for owner', async () => {
            const { agent, user } = await authenticateAgent(app);

            const [note] = await db('notes')
                .insert({
                    user_id: user.id,
                    title: 'Test Note',
                    content: '# Heading\n\nThis is **markdown** content.',
                    pinned: false,
                })
                .returning('*');

            const response = await agent.get(`/notes/${note.id}/download`).expect(200);

            expect(response.headers['content-type']).toContain('text/markdown');
            expect(response.headers['content-disposition']).toContain('attachment');
            expect(response.headers['content-disposition']).toContain('test-note.md');
            expect(response.text).toBe('# Heading\n\nThis is **markdown** content.');
        });

        it('should convert title to dash-case for filename', async () => {
            const { agent, user } = await authenticateAgent(app);

            const [note] = await db('notes')
                .insert({
                    user_id: user.id,
                    title: 'My Cool Note Title!',
                    content: 'Test content',
                    pinned: false,
                })
                .returning('*');

            const response = await agent.get(`/notes/${note.id}/download`).expect(200);

            expect(response.headers['content-disposition']).toContain('my-cool-note-title.md');
        });

        it('should handle special characters in title for filename', async () => {
            const { agent, user } = await authenticateAgent(app);

            const [note] = await db('notes')
                .insert({
                    user_id: user.id,
                    title: 'Test@#$%Note   With  Spaces',
                    content: 'Test content',
                    pinned: false,
                })
                .returning('*');

            const response = await agent.get(`/notes/${note.id}/download`).expect(200);

            expect(response.headers['content-disposition']).toContain('testnote-with-spaces.md');
        });

        it('should not allow downloading notes from other users', async () => {
            const { agent } = await authenticateAgent(app);

            const [otherUser] = await db('users')
                .insert({
                    username: 'otheruser5',
                    email: 'other5@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                })
                .returning('*');

            const [note] = await db('notes')
                .insert({
                    user_id: otherUser.id,
                    title: 'Other User Note',
                    content: 'Other content',
                    pinned: false,
                })
                .returning('*');

            await agent.get(`/notes/${note.id}/download`).expect(404);
        });
    });

    describe('POST /api/notes/render-markdown', () => {
        it('should require authentication', async () => {
            await request(app)
                .post('/api/notes/render-markdown')
                .set('Accept', 'application/json')
                .set('Content-Type', 'application/json')
                .send({ markdown: '# Test' })
                .expect(401);
        });

        it('should render markdown to HTML', async () => {
            const { agent } = await authenticateApiAgent(app);

            const response = await agent
                .post('/api/notes/render-markdown')
                .send({ content: '# Heading\n\n**Bold text**' })
                .expect(200);

            expect(response.body.content).toContain('<h1>Heading</h1>');
            expect(response.body.content).toContain('<strong>Bold text</strong>');
        });

        it('should handle empty markdown', async () => {
            const { agent } = await authenticateApiAgent(app);

            const response = await agent.post('/api/notes/render-markdown').send({ content: '' });

            if (response.status === 422) {
                expect(response.body.message).toContain('Validation');
            } else {
                expect(response.status).toBe(200);
                expect(response.body.html).toBe('');
            }
        });

        it('should sanitize XSS in script tags', async () => {
            const { agent } = await authenticateApiAgent(app);

            const response = await agent
                .post('/api/notes/render-markdown')
                .send({ content: '<script>alert("xss")</script>' })
                .expect(200);

            expect(response.body.content).not.toContain('<script>');
            expect(response.body.content).not.toContain('alert');
        });

        it('should sanitize XSS in event handlers', async () => {
            const { agent } = await authenticateApiAgent(app);

            const response = await agent
                .post('/api/notes/render-markdown')
                .send({ content: '<img src="x" onerror="alert(1)">' })
                .expect(200);

            expect(response.body.content).not.toContain('onerror');
            expect(response.body.content).not.toContain('alert');
        });

        it('should sanitize XSS in javascript: URLs', async () => {
            const { agent } = await authenticateApiAgent(app);

            const response = await agent
                .post('/api/notes/render-markdown')
                .send({ content: '<a href="javascript:alert(1)">click</a>' })
                .expect(200);

            expect(response.body.content).not.toContain('javascript:');
        });

        it('should allow safe HTML elements', async () => {
            const { agent } = await authenticateApiAgent(app);

            const response = await agent
                .post('/api/notes/render-markdown')
                .send({ content: '# Heading\n\n<strong>Bold</strong>\n\n<em>Italic</em>' })
                .expect(200);

            expect(response.body.content).toContain('<h1>Heading</h1>');
            expect(response.body.content).toContain('<strong>Bold</strong>');
            expect(response.body.content).toContain('<em>Italic</em>');
        });
    });

    describe('Hidden Items Functionality', () => {
        describe('POST /notes - Hidden field', () => {
            it('should reject creating hidden note without global password', async () => {
                const { agent, user } = await authenticateAgent(app);

                await agent
                    .post('/notes')
                    .type('form')
                    .send({
                        title: 'Hidden Note',
                        content: 'Secret content',
                        hidden: 'on',
                    })
                    .expect(302);

                const note = await db('notes').where({ user_id: user.id }).first();
                expect(note).toBeUndefined();
            });

            it('should create hidden note when global password is set', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                await agent
                    .post('/notes')
                    .type('form')
                    .send({
                        title: 'Hidden Note',
                        content: 'Secret content',
                        hidden: 'on',
                    })
                    .expect(302);

                const note = await db('notes').where({ user_id: user.id }).first();
                expect(note).toBeDefined();
                expect(note.title).toBe('Hidden Note');
                expect(note.hidden).toBe(1);
            });

            it('should exclude hidden notes from listing', async () => {
                const { agent, user } = await authenticateAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                await db('notes').insert([
                    {
                        user_id: user.id,
                        title: 'Public Note',
                        content: 'Public content',
                        hidden: false,
                    },
                    {
                        user_id: user.id,
                        title: 'Hidden Note',
                        content: 'Secret content',
                        hidden: true,
                    },
                ]);

                const response = await agent.get('/notes').expect(200);
                expect(response.text).toContain('Public Note');
                expect(response.text).not.toContain('Hidden Note');
            });
        });

        describe('POST /api/notes - Hidden field via API', () => {
            it('should reject creating hidden note without global password via API', async () => {
                const { agent } = await authenticateApiAgent(app);

                const response = await agent
                    .post('/api/notes')
                    .send({
                        title: 'Hidden Note',
                        content: 'Secret content',
                        hidden: true,
                    })
                    .expect(422);

                expect(response.body.message).toContain('Validation');
            });

            it('should create hidden note with global password via API', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                const response = await agent
                    .post('/api/notes')
                    .send({
                        title: 'Hidden API Note',
                        content: 'Secret API content',
                        hidden: true,
                    })
                    .expect(201);

                expect(response.body.message).toContain('created successfully');

                const note = await db('notes').where({ user_id: user.id }).first();
                expect(note.hidden).toBe(1);
            });
        });

        describe('PUT /api/notes/:id - Update hidden field', () => {
            it('should allow toggling hidden status with global password', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                const [note] = await db('notes')
                    .insert({
                        user_id: user.id,
                        title: 'Test Note',
                        content: 'Test content',
                        hidden: false,
                    })
                    .returning('*');

                await agent
                    .put(`/api/notes/${note.id}`)
                    .send({
                        title: 'Test Note',
                        content: 'Test content',
                        hidden: true,
                    })
                    .expect(200);

                const updatedNote = await db('notes').where({ id: note.id }).first();
                expect(updatedNote.hidden).toBe(1);
            });

            it('should reject hiding note without global password', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                const [note] = await db('notes')
                    .insert({
                        user_id: user.id,
                        title: 'Test Note',
                        content: 'Test content',
                        hidden: false,
                    })
                    .returning('*');

                const response = await agent
                    .put(`/api/notes/${note.id}`)
                    .send({
                        title: 'Test Note',
                        content: 'Test content',
                        hidden: true,
                    })
                    .expect(422);

                expect(response.body.message).toContain('Validation');
            });
        });

        describe('GET /api/notes - Hidden notes exclusion', () => {
            it('should exclude hidden notes from API listing', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                await db('users')
                    .where({ id: user.id })
                    .update({ hidden_items_password: 'hashed_password' });

                await db('notes').insert([
                    {
                        user_id: user.id,
                        title: 'Public Note',
                        content: 'Public content',
                        hidden: false,
                    },
                    {
                        user_id: user.id,
                        title: 'Hidden Note',
                        content: 'Secret content',
                        hidden: true,
                    },
                ]);

                const response = await agent.get('/api/notes').expect(200);

                expect(response.body.data).toHaveLength(1);
                expect(response.body.data[0].title).toBe('Public Note');
            });
        });

        describe('POST /notes/delete', () => {
            it('should delete multiple notes', async () => {
                const { agent, user } = await authenticateAgent(app);

                const [note1] = await db('notes')
                    .insert({ user_id: user.id, title: 'Note 1', content: 'Content 1' })
                    .returning('*');
                const [note2] = await db('notes')
                    .insert({ user_id: user.id, title: 'Note 2', content: 'Content 2' })
                    .returning('*');

                await agent
                    .post('/notes/delete')
                    .send({ id: [note1.id.toString(), note2.id.toString()] })
                    .expect(302);

                const remainingNotes = await db('notes').where({ user_id: user.id });
                expect(remainingNotes).toHaveLength(0);
            });

            it('should only delete notes owned by the user', async () => {
                const { agent, user } = await authenticateAgent(app);

                const [otherUser] = await db('users')
                    .insert({
                        username: 'otheruser',
                        email: 'other@example.com',
                        is_admin: false,
                        default_search_provider: 'duckduckgo',
                    })
                    .returning('*');

                const [userNote] = await db('notes')
                    .insert({ user_id: user.id, title: 'My Note', content: 'My content' })
                    .returning('*');

                const [otherNote] = await db('notes')
                    .insert({
                        user_id: otherUser.id,
                        title: 'Other Note',
                        content: 'Other content',
                    })
                    .returning('*');

                await agent
                    .post('/notes/delete')
                    .send({ id: [userNote.id.toString(), otherNote.id.toString()] })
                    .expect(302);

                const userNotes = await db('notes').where({ user_id: user.id });
                expect(userNotes).toHaveLength(0);

                const otherNotes = await db('notes').where({ user_id: otherUser.id });
                expect(otherNotes).toHaveLength(1);
            });

            it('should require id array', async () => {
                const { agent } = await authenticateAgent(app);

                await agent.post('/notes/delete').type('form').send({}).expect(302);
            });
        });

        describe('POST /api/notes/delete', () => {
            it('should delete multiple notes via API', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                const [note1] = await db('notes')
                    .insert({ user_id: user.id, title: 'Note 1', content: 'Content 1' })
                    .returning('*');
                const [note2] = await db('notes')
                    .insert({ user_id: user.id, title: 'Note 2', content: 'Content 2' })
                    .returning('*');

                const response = await agent
                    .post('/api/notes/delete')
                    .send({ id: [note1.id.toString(), note2.id.toString()] })
                    .expect(200);

                expect(response.body.message).toContain('2 notes deleted successfully');
                expect(response.body.data.deletedCount).toBe(2);

                const remainingNotes = await db('notes').where({ user_id: user.id });
                expect(remainingNotes).toHaveLength(0);
            });

            it('should return correct count when some IDs are invalid', async () => {
                const { agent, user } = await authenticateApiAgent(app);

                const [note1] = await db('notes')
                    .insert({ user_id: user.id, title: 'Note 1', content: 'Content 1' })
                    .returning('*');

                const response = await agent
                    .post('/api/notes/delete')
                    .send({ id: [note1.id.toString(), '99999'] })
                    .expect(200);

                expect(response.body.data.deletedCount).toBe(1);
            });

            it('should require id to be an array', async () => {
                const { agent } = await authenticateApiAgent(app);

                await agent.post('/api/notes/delete').send({ id: 'not-an-array' }).expect(422);
            });
        });
    });

    describe('Search Highlighting', () => {
        it('should highlight search terms in title and content', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('notes').insert([
                {
                    user_id: user.id,
                    title: 'Meeting Notes',
                    content: 'Discussed the quarterly meeting schedule',
                },
                { user_id: user.id, title: 'Other Note', content: 'Some other content' },
            ]);

            const response = await agent.get('/notes?search=meeting').expect(200);

            expect(response.text).toContain('<mark>Meeting</mark> Notes');
            expect(response.text).toContain('<mark>meeting</mark>');
            expect(response.text).not.toContain('Other Note');
        });

        it('should highlight multiple search words', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('notes').insert({
                user_id: user.id,
                title: 'Project Planning Document',
                content: 'This document outlines the project plan',
            });

            const response = await agent.get('/notes?search=project+plan').expect(200);

            expect(response.text).toContain('<mark>Project</mark>');
            expect(response.text).toContain('<mark>plan</mark>');
        });

        it('should return all results without highlighting when no search term', async () => {
            const { agent, user } = await authenticateAgent(app);

            await db('notes').insert([
                { user_id: user.id, title: 'Note One', content: 'Content one' },
                { user_id: user.id, title: 'Note Two', content: 'Content two' },
            ]);

            const response = await agent.get('/notes').expect(200);

            expect(response.text).toContain('Note One');
            expect(response.text).toContain('Note Two');
            expect(response.text).not.toContain('<mark>');
        });

        it('should highlight search terms in API response', async () => {
            const { agent, user } = await authenticateApiAgent(app);

            await db('notes').insert({
                user_id: user.id,
                title: 'Testing Highlight',
                content: 'This note is about highlight testing',
            });

            const response = await agent.get('/api/notes?search=highlight').expect(200);

            expect(response.body.data[0].title).toContain('<mark>Highlight</mark>');
            expect(response.body.data[0].content).toContain('<mark>highlight</mark>');
        });
    });
});
