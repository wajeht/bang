import { authenticateAgent, createUnauthenticatedAgent } from '../../tests/test-utils.js';
import { request } from '../../tests/hono-test-client.js';
import { db, app } from '../../tests/test-setup.js';
import { describe, it, expect } from 'vite-plus/test';

describe('Notes Routes', () => {
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

            const response = await agent
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
            expect(response.headers.location).toBe(`/notes/${note.id}`);
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

                const response = await agent
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
                expect(response.headers.location).toBe(`/notes/${note.id}`);
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
    });
});
