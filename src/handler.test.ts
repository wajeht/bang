import { db, notes } from './db/db';
import { logger } from './utils/logger';
import type { Request, Response } from 'express';
import { getHealthzHandler, toggleNotePinHandler } from './handler';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
