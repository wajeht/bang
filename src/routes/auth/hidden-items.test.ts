import { describe, it, expect } from 'vite-plus/test';
import { app, db } from '../../tests/test-setup.js';
import { authenticateAgent, authenticateApiAgent } from '../../tests/api-test-utils.js';

async function createHiddenItems(userId: number) {
    const [note] = await db('notes')
        .insert({
            user_id: userId,
            title: 'Protected note',
            content: 'private-note-marker',
            hidden: true,
        })
        .returning('*');
    const [bookmark] = await db('bookmarks')
        .insert({
            user_id: userId,
            title: 'Protected bookmark',
            url: 'https://example.com/private-bookmark-marker',
            hidden: true,
        })
        .returning('*');
    const [action] = await db('bangs')
        .insert({
            user_id: userId,
            name: 'Protected action',
            trigger: '!privatemarker',
            url: 'https://example.com/private-action-marker',
            action_type: 'redirect',
            hidden: true,
        })
        .returning('*');
    return { note, bookmark, action };
}

async function createLockedSession() {
    const { agent, user } = await authenticateAgent(app);
    await agent
        .post('/settings/hidden-password')
        .send({ newPassword: 'test-password' })
        .expect(302);
    return { agent, user, ...(await createHiddenItems(user.id)) };
}

describe('Hidden item authorization', () => {
    it('should deny session access across HTML and JSON route variants until password verification', async () => {
        const { agent, note, bookmark, action } = await createLockedSession();
        const paths = [
            `/notes/${note.id}/edit`,
            `/notes/${note.id}/download`,
            `/api/notes/${note.id}`,
            `/bookmarks/${bookmark.id}/edit`,
            `/api/bookmarks/${bookmark.id}`,
            `/actions/${action.id}/edit`,
            `/api/actions/${action.id}`,
        ];
        for (const path of paths) {
            const response = await agent.get(path).expect(403);
            expect(response.text).not.toContain('private-note-marker');
            expect(response.text).not.toContain('private-bookmark-marker');
            expect(response.text).not.toContain('private-action-marker');
        }
        await agent.get(`/notes/${note.id}`).set('Accept', 'application/json').expect(403);
        const prompt = await agent.get(`/notes/${note.id}`).expect(200);
        expect(prompt.text).toContain('Password Required');
        expect(prompt.text).not.toContain('private-note-marker');
        await agent.get(`/api/notes/${note.id}`).set('X-API-KEY', 'invalid').expect(401);

        await agent
            .post('/verify-hidden-password')
            .send({
                password: 'test-password',
                resource_type: 'note',
                resource_id: note.id,
                redirect_url: `/notes/${note.id}`,
            })
            .expect(302);
        for (const path of paths) await agent.get(path).expect(200);
        const response = await agent
            .get(`/notes/${note.id}`)
            .set('Accept', 'application/json')
            .expect(200);
        expect(response.body.data.content).toBe('private-note-marker');
    });

    it('should reject session updates that unhide locked items', async () => {
        const { agent, note, bookmark, action } = await createLockedSession();
        await agent
            .put(`/api/notes/${note.id}`)
            .send({ title: note.title, content: note.content, hidden: false })
            .expect(403);
        await agent
            .patch(`/api/bookmarks/${bookmark.id}`)
            .send({ title: bookmark.title, url: bookmark.url, hidden: false })
            .expect(403);
        await agent
            .patch(`/api/actions/${action.id}`)
            .send({
                name: action.name,
                trigger: action.trigger,
                url: action.url,
                actionType: 'redirect',
                hidden: false,
            })
            .expect(403);
        await agent.post(`/bookmarks/${bookmark.id}/hide`).send({}).expect(403);
        await agent.post(`/actions/${action.id}/hide`).send({}).expect(403);
        for (const [table, id] of [
            ['notes', note.id],
            ['bookmarks', bookmark.id],
            ['bangs', action.id],
        ]) {
            expect((await db(table).where({ id }).first()).hidden).toBe(1);
        }
        await agent.post('/verify-hidden-password').send({ password: 'test-password' }).expect(302);
        await agent
            .put(`/api/notes/${note.id}`)
            .send({ title: note.title, content: note.content, hidden: false })
            .expect(200);
    });

    it('should stop accepting expired global and item verification', async () => {
        const { agent, user, note } = await createLockedSession();
        await agent
            .post('/verify-hidden-password')
            .send({ password: 'test-password', resource_type: 'note', resource_id: note.id })
            .expect(302);
        await agent.get(`/notes/${note.id}/download`).expect(200);
        const expired = Date.now() - 31 * 60 * 1000;
        await db('sessions')
            .whereRaw("json_extract(sess, '$.user.id') = ?", [user.id])
            .update({
                sess: db.raw(
                    "json_set(sess, '$.hiddenItemsVerifiedAt', ?, '$.verifiedHiddenItems', json(?))",
                    [expired, JSON.stringify({ [`note_${note.id}`]: expired })],
                ),
            });
        await agent.get(`/notes/${note.id}/download`).expect(403);
        await agent.get(`/notes/${note.id}`).set('Accept', 'application/json').expect(403);
        const response = await agent.get(`/notes/${note.id}`).expect(200);
        expect(response.text).toContain('Password Required');
        expect(response.text).not.toContain('private-note-marker');
    });

    it('should keep independently authenticated API-key access and ownership checks', async () => {
        const { agent, user } = await authenticateApiAgent(app);
        const { note, bookmark, action } = await createHiddenItems(user.id);
        for (const path of [
            `/api/notes/${note.id}`,
            `/api/bookmarks/${bookmark.id}`,
            `/api/actions/${action.id}`,
        ])
            await agent.get(path).expect(200);
        const { agent: other } = await authenticateAgent(app, {
            email: 'other-hidden@example.com',
        });
        for (const path of [
            `/api/notes/${note.id}`,
            `/notes/${note.id}/edit`,
            `/notes/${note.id}/download`,
            `/api/bookmarks/${bookmark.id}`,
            `/api/actions/${action.id}`,
        ])
            await other.get(path).expect(404);
    });
});
