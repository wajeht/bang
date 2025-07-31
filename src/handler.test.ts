import dayjs from './utils/dayjs';
import { db, notes } from './db/db';
import type { Request, Response } from 'express';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getHealthzHandler, toggleNotePinHandler, postImportDataHandler } from './handler';

describe('Health Check Endpoint', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;

    beforeEach(() => {
        vi.resetAllMocks();

        req = {
            headers: {},
            header: vi.fn().mockImplementation((name) => {
                if (name === 'Content-Type') {
                    return req.headers?.['content-type'];
                }
                if (name === 'Accept') {
                    return req.headers?.['accept'];
                }
                return undefined;
            }),
        };

        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            setHeader: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis(),
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    it('should return 200 status when database is connected (JSON response)', async () => {
        req = {
            headers: {
                'content-type': 'application/json',
                accept: 'application/json',
            },
            header: vi.fn().mockImplementation((name) => {
                if (name === 'Content-Type') {
                    return 'application/json';
                }
                return undefined;
            }),
        };

        const handler = getHealthzHandler(db);
        await handler(req as Request, res as Response);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ status: 'ok', database: 'connected' });
    });

    it('should return 200 status when database is connected (HTML response)', async () => {
        const handler = getHealthzHandler(db);
        await handler(req as Request, res as Response);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
        expect(res.send).toHaveBeenCalledWith('<p>ok</p>');
    });
});

describe('Toggle Note Pin Handler', () => {
    let testUserId: number;
    let testNoteId: number;
    let req: any;
    let res: any;

    beforeEach(async () => {
        await db('users').where('email', 'test@example.com').delete();

        const [user] = await db('users')
            .insert({
                username: 'testuser',
                email: 'test@example.com',
                is_admin: false,
                email_verified_at: db.fn.now(),
            })
            .returning('*');

        testUserId = user.id;

        const [note] = await db('notes')
            .insert({
                user_id: testUserId,
                title: 'Test Note',
                content: 'Test content',
                pinned: false,
            })
            .returning('*');

        testNoteId = note.id;

        req = {
            user: { id: testUserId },
            params: { id: testNoteId },
            flash: vi.fn(),
            header: vi.fn().mockReturnValue(undefined),
            path: '/notes/123/pin',
        };

        res = {
            status: vi.fn().mockReturnThis(),
            json: vi.fn().mockReturnThis(),
            redirect: vi.fn(),
        };
    });

    afterEach(async () => {
        if (testUserId) {
            await db('notes').where({ user_id: testUserId }).delete();
            await db('users').where({ id: testUserId }).delete();
        }
        vi.clearAllMocks();
    });

    it('should pin an unpinned note', async () => {
        const handler = toggleNotePinHandler(notes);

        await handler(req as Request, res as Response);

        const updatedNote = await db('notes').where({ id: testNoteId }).first();
        expect(updatedNote.pinned).toBe(1);
        expect(req.flash).toHaveBeenCalledWith('success', 'Note pinned successfully');
        expect(res.redirect).toHaveBeenCalledWith('/notes');
    });

    it('should unpin a pinned note', async () => {
        await db('notes').where({ id: testNoteId }).update({ pinned: true });

        const handler = toggleNotePinHandler(notes);

        await handler(req as Request, res as Response);

        const updatedNote = await db('notes').where({ id: testNoteId }).first();
        expect(updatedNote.pinned).toBe(0);
        expect(req.flash).toHaveBeenCalledWith('success', 'Note unpinned successfully');
        expect(res.redirect).toHaveBeenCalledWith('/notes');
    });

    it('should return 404 for non-existent note', async () => {
        req.params.id = 99999;

        const handler = toggleNotePinHandler(notes);

        await expect(handler(req as Request, res as Response)).rejects.toThrow('Note not found');
    });

    it('should not allow pinning notes from other users', async () => {
        const [otherUser] = await db('users')
            .insert({
                username: 'otheruser',
                email: 'other@example.com',
                is_admin: false,
            })
            .returning('*');

        req.user.id = otherUser.id;

        const handler = toggleNotePinHandler(notes);

        await expect(handler(req as Request, res as Response)).rejects.toThrow('Note not found');

        await db('users').where({ id: otherUser.id }).delete();
    });
});

describe('Import Data Handler', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let userId: number;

    beforeEach(async () => {
        vi.resetAllMocks();

        // Create a test user
        const [user] = await db('users')
            .insert({
                username: 'testuser',
                email: 'test@example.com',
                is_admin: false,
            })
            .returning('*');

        userId = user.id;

        req = {
            body: {},
            session: {
                user: { id: userId },
            } as any,
            flash: vi.fn(),
        };

        res = {
            redirect: vi.fn().mockReturnThis(),
        };
    });

    afterEach(async () => {
        // Clean up test data
        await db('bangs').where({ user_id: userId }).delete();
        await db('users').where({ id: userId }).delete();
    });

    it('should handle duplicate actions gracefully', async () => {
        // First, create an existing action
        await db('bangs').insert({
            user_id: userId,
            trigger: '!test',
            name: 'Test Action',
            url: 'https://example.com',
            action_type: 'redirect',
            created_at: dayjs().toDate(),
        });

        // Prepare import data with the same action
        const importData = {
            version: '1.0',
            actions: [
                {
                    trigger: '!test',
                    name: 'Test Action Updated',
                    url: 'https://example.com/updated',
                    action_type: 'redirect',
                },
            ],
        };

        req.body = { config: JSON.stringify(importData) };

        const handler = postImportDataHandler(db);
        await handler(req as Request, res as Response);

        // Verify that no duplicate was created
        const actions = await db('bangs').where({ user_id: userId, trigger: '!test' });
        expect(actions).toHaveLength(1);

        // Verify the original action wasn't modified
        expect(actions[0].name).toBe('Test Action');
        expect(actions[0].url).toBe('https://example.com');

        expect(req.flash).toHaveBeenCalledWith('success', 'Data imported successfully!');
        expect(res.redirect).toHaveBeenCalledWith('/settings/data');
    });

    it('should import new actions successfully', async () => {
        const importData = {
            version: '1.0',
            actions: [
                {
                    trigger: '!new',
                    name: 'New Action',
                    url: 'https://new.com',
                    action_type: 'redirect',
                },
            ],
        };

        req.body = { config: JSON.stringify(importData) };

        const handler = postImportDataHandler(db);
        await handler(req as Request, res as Response);

        // Verify the new action was created
        const actions = await db('bangs').where({ user_id: userId, trigger: '!new' });
        expect(actions).toHaveLength(1);
        expect(actions[0].name).toBe('New Action');
        expect(actions[0].url).toBe('https://new.com');

        expect(req.flash).toHaveBeenCalledWith('success', 'Data imported successfully!');
        expect(res.redirect).toHaveBeenCalledWith('/settings/data');
    });
});
