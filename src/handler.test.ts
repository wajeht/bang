import {
    getHealthzHandler,
    toggleNotePinHandler,
    postExportDataHandler,
    postDeleteSettingsDangerZoneHandler,
} from './handler';
import { db } from './db/db';
import { notes } from './db/db';
import { logger } from './utils/logger';
import type { Request, Response } from 'express';
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

describe('Export Data Handler', () => {
    let req: Partial<Request>;
    let res: Partial<Response>;
    let testUserId: number;

    beforeEach(async () => {
        vi.resetAllMocks();

        await db.raw(`
            INSERT OR IGNORE INTO action_types (name) VALUES
            ('search'),
            ('redirect'),
            ('bookmark')
        `);

        await db('users').where('email', 'handler-test@example.com').delete();
        await db('users').where('username', 'testuser').delete();

        const [user] = await db('users')
            .insert({
                username: 'testuser',
                email: 'handler-test@example.com',
                is_admin: false,
                default_search_provider: 'duckduckgo',
                autocomplete_search_on_homepage: false,
            })
            .returning('*');

        testUserId = user.id;

        req = {
            user: {
                id: testUserId,
                username: 'testuser',
                email: 'handler-test@example.com',
                is_admin: false,
                default_search_provider: 'duckduckgo',
                bookmarks_per_page: 10,
                actions_per_page: 10,
                api_key: 'test-key',
                api_key_version: 1,
                api_key_created_at: '2023-01-01',
                autocomplete_search_on_homepage: false,
                column_preferences: {
                    bookmarks: {
                        title: true,
                        url: true,
                        created_at: true,
                        default_per_page: 10,
                        pinned: true,
                    },
                    actions: {
                        name: true,
                        trigger: true,
                        url: true,
                        created_at: true,
                        last_read_at: true,
                        default_per_page: 10,
                        action_type: true,
                        usage_count: true,
                    },
                    notes: {
                        title: true,
                        content: true,
                        created_at: true,
                        default_per_page: 10,
                        view_type: 'table',
                        pinned: true,
                    },
                    users: {
                        username: true,
                        email: true,
                        is_admin: true,
                        email_verified_at: true,
                        created_at: true,
                        default_per_page: 10,
                    },
                },
                email_verified_at: null,
                created_at: '2023-01-01',
                updated_at: '2023-01-01',
            },
            body: {
                options: ['bookmarks', 'actions', 'notes'],
            },
        };

        res = {
            setHeader: vi.fn().mockReturnThis(),
            send: vi.fn().mockReturnThis(),
        };
    });

    afterEach(async () => {
        if (testUserId) {
            await db('notes').where({ user_id: testUserId }).delete();
            await db('bookmarks').where({ user_id: testUserId }).delete();
            await db('bangs').where({ user_id: testUserId }).delete();
            await db('users').where({ id: testUserId }).delete();
        }
        vi.clearAllMocks();
    });

    it('should export all data types successfully', async () => {
        await db('bookmarks').insert({
            user_id: testUserId,
            title: 'Test Bookmark',
            url: 'https://test.com',
        });

        const actionType = await db('action_types').select('id').first();
        await db('bangs').insert({
            user_id: testUserId,
            trigger: '!test',
            name: 'Test Action',
            url: 'https://action.com',
            action_type_id: actionType.id,
        });

        await db('notes').insert({
            user_id: testUserId,
            title: 'Test Note',
            content: 'Test content',
        });

        const handler = postExportDataHandler(db, logger);
        await handler(req as Request, res as Response);

        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
        expect(res.setHeader).toHaveBeenCalledWith(
            'Content-Disposition',
            expect.stringMatching(/attachment; filename=bang-data-export-.*\.json/),
        );

        const sentData = (res.send as any).mock.calls[0][0];
        const exportData = JSON.parse(sentData);

        expect(exportData.bookmarks).toBeDefined();
        expect(exportData.bookmarks).toHaveLength(1);
        expect(exportData.bookmarks[0].title).toBe('Test Bookmark');

        expect(exportData.actions).toBeDefined();
        expect(exportData.actions).toHaveLength(1);
        expect(exportData.actions[0].name).toBe('Test Action');

        expect(exportData.notes).toBeDefined();
        expect(exportData.notes).toHaveLength(1);
        expect(exportData.notes[0].title).toBe('Test Note');
    });

    it('should export only selected data types', async () => {
        await db('bookmarks').insert({
            user_id: testUserId,
            title: 'Test Bookmark',
            url: 'https://test.com',
        });

        const actionType = await db('action_types').select('id').first();
        await db('bangs').insert({
            user_id: testUserId,
            trigger: '!test',
            name: 'Test Action',
            url: 'https://action.com',
            action_type_id: actionType.id,
        });

        await db('notes').insert({
            user_id: testUserId,
            title: 'Test Note',
            content: 'Test content',
        });

        req.body = { options: ['bookmarks'] };

        const handler = postExportDataHandler(db, logger);
        await handler(req as Request, res as Response);

        const sentData = (res.send as any).mock.calls[0][0];
        const exportData = JSON.parse(sentData);

        expect(exportData.bookmarks).toBeDefined();
        expect(exportData.bookmarks).toHaveLength(1);
        expect(exportData.actions).toBeUndefined();
        expect(exportData.notes).toBeUndefined();
    });

    it('should handle empty data gracefully', async () => {
        const handler = postExportDataHandler(db, logger);
        await handler(req as Request, res as Response);

        const sentData = (res.send as any).mock.calls[0][0];
        const exportData = JSON.parse(sentData);

        expect(exportData.bookmarks).toEqual([]);
        expect(exportData.actions).toEqual([]);
        expect(exportData.notes).toEqual([]);
        expect(exportData.exported_at).toBeDefined();
        expect(exportData.version).toBe('1.0');
    });

    it('should include correct metadata in export', async () => {
        const handler = postExportDataHandler(db, logger);
        await handler(req as Request, res as Response);

        const sentData = (res.send as any).mock.calls[0][0];
        const exportData = JSON.parse(sentData);

        expect(exportData.exported_at).toBeDefined();
        expect(exportData.version).toBe('1.0');
        expect(new Date(exportData.exported_at)).toBeInstanceOf(Date);
    });

    it('should set correct response headers', async () => {
        const handler = postExportDataHandler(db, logger);
        await handler(req as Request, res as Response);

        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
        expect(res.setHeader).toHaveBeenCalledWith(
            'Content-Disposition',
            expect.stringMatching(
                /attachment; filename=bang-data-export-\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z\.json/,
            ),
        );
    });

    it('should export multiple items of each type', async () => {
        await db('bookmarks').insert([
            { user_id: testUserId, title: 'Bookmark 1', url: 'https://test1.com' },
            { user_id: testUserId, title: 'Bookmark 2', url: 'https://test2.com' },
        ]);

        const actionType = await db('action_types').select('id').first();
        await db('bangs').insert([
            {
                user_id: testUserId,
                trigger: '!test1',
                name: 'Action 1',
                url: 'https://action1.com',
                action_type_id: actionType.id,
            },
            {
                user_id: testUserId,
                trigger: '!test2',
                name: 'Action 2',
                url: 'https://action2.com',
                action_type_id: actionType.id,
            },
        ]);

        await db('notes').insert([
            { user_id: testUserId, title: 'Note 1', content: 'Content 1' },
            { user_id: testUserId, title: 'Note 2', content: 'Content 2' },
        ]);

        const handler = postExportDataHandler(db, logger);
        await handler(req as Request, res as Response);

        const sentData = (res.send as any).mock.calls[0][0];
        const exportData = JSON.parse(sentData);

        expect(exportData.bookmarks).toHaveLength(2);
        expect(exportData.actions).toHaveLength(2);
        expect(exportData.notes).toHaveLength(2);
    });
});

describe('Toggle Note Pin Handler', () => {
    let testUserId: number;
    let testNoteId: number;
    let req: any;
    let res: any;

    beforeEach(async () => {
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
            redirect: vi.fn().mockReturnThis(),
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

describe('Delete Settings Danger Zone Handler', () => {
    let testUserId: number;
    let req: any;
    let res: any;

    beforeEach(async () => {
        vi.clearAllMocks();

        const [user] = await db('users')
            .insert({
                username: 'dangeruser',
                email: 'danger@example.com',
                is_admin: false,
                email_verified_at: db.fn.now(),
            })
            .returning('*');

        testUserId = user.id;

        req = {
            session: {
                user: {
                    id: testUserId,
                    email: 'danger@example.com',
                    username: 'dangeruser',
                },
                destroy: vi.fn((callback) => callback(null)),
            },
            user: {
                id: testUserId,
                email: 'danger@example.com',
                username: 'dangeruser',
            },
            body: {},
            flash: vi.fn(),
        };

        res = {
            redirect: vi.fn(),
        };
    });

    afterEach(async () => {
        if (testUserId) {
            await db('notes').where({ user_id: testUserId }).delete();
            await db('bookmarks').where({ user_id: testUserId }).delete();
            await db('bangs').where({ user_id: testUserId }).delete();
            await db('users').where({ id: testUserId }).delete();
        }
        vi.clearAllMocks();
    });

    it('should delete user account without export options', async () => {
        req.body.export_options = [];

        const handler = postDeleteSettingsDangerZoneHandler(db);
        await handler(req as Request, res as Response);

        const deletedUser = await db('users').where({ id: testUserId }).first();
        expect(deletedUser).toBeUndefined();

        expect(req.session.destroy).toHaveBeenCalled();
        expect(res.redirect).toHaveBeenCalledWith('/?toast=🗑️ deleted');
    });

    it('should send JSON export email before deletion', async () => {
        req.body.export_options = ['json'];

        await db('bookmarks').insert({
            user_id: testUserId,
            title: 'Test Bookmark',
            url: 'https://test.com',
        });

        const handler = postDeleteSettingsDangerZoneHandler(db);
        await handler(req as Request, res as Response);

        const deletedUser = await db('users').where({ id: testUserId }).first();
        expect(deletedUser).toBeUndefined();

        expect(res.redirect).toHaveBeenCalledWith('/?toast=🗑️ deleted');
    });

    it('should send HTML export email before deletion', async () => {
        req.body.export_options = ['html'];

        await db('bookmarks').insert({
            user_id: testUserId,
            title: 'Test Bookmark',
            url: 'https://test.com',
        });

        const handler = postDeleteSettingsDangerZoneHandler(db);
        await handler(req as Request, res as Response);

        const deletedUser = await db('users').where({ id: testUserId }).first();
        expect(deletedUser).toBeUndefined();

        expect(res.redirect).toHaveBeenCalledWith('/?toast=🗑️ deleted');
    });

    it('should send both exports before deletion', async () => {
        req.body.export_options = ['json', 'html'];

        await db('bookmarks').insert({
            user_id: testUserId,
            title: 'Test Bookmark',
            url: 'https://test.com',
        });

        const handler = postDeleteSettingsDangerZoneHandler(db);
        await handler(req as Request, res as Response);

        const deletedUser = await db('users').where({ id: testUserId }).first();
        expect(deletedUser).toBeUndefined();

        expect(res.redirect).toHaveBeenCalledWith('/?toast=🗑️ deleted');
    });

    it('should handle single export option (not array)', async () => {
        req.body.export_options = 'json';

        const handler = postDeleteSettingsDangerZoneHandler(db);
        await handler(req as Request, res as Response);

        const deletedUser = await db('users').where({ id: testUserId }).first();
        expect(deletedUser).toBeUndefined();

        expect(res.redirect).toHaveBeenCalledWith('/?toast=🗑️ deleted');
    });

    it('should continue deletion even if export email fails', async () => {
        req.body.export_options = ['json'];

        const handler = postDeleteSettingsDangerZoneHandler(db);
        await handler(req as Request, res as Response);

        const deletedUser = await db('users').where({ id: testUserId }).first();
        expect(deletedUser).toBeUndefined();

        expect(res.redirect).toHaveBeenCalledWith('/?toast=🗑️ deleted');
    });

    it('should throw error if user not found', async () => {
        req.session.user = null;

        const handler = postDeleteSettingsDangerZoneHandler(db);

        await expect(handler(req as Request, res as Response)).rejects.toThrow('User not found');
    });

    it('should delete user data along with account', async () => {
        await db('bookmarks').insert({
            user_id: testUserId,
            title: 'Test Bookmark',
            url: 'https://test.com',
        });

        const actionType = await db('action_types').where('name', 'search').first();
        await db('bangs').insert({
            user_id: testUserId,
            trigger: '!test',
            name: 'Test Action',
            url: 'https://action.com',
            action_type_id: actionType.id,
        });

        await db('notes').insert({
            user_id: testUserId,
            title: 'Test Note',
            content: 'Test content',
        });

        const handler = postDeleteSettingsDangerZoneHandler(db);
        await handler(req as Request, res as Response);

        const remainingBookmarks = await db('bookmarks').where({ user_id: testUserId });
        const remainingActions = await db('bangs').where({ user_id: testUserId });
        const remainingNotes = await db('notes').where({ user_id: testUserId });

        expect(remainingBookmarks).toHaveLength(0);
        expect(remainingActions).toHaveLength(0);
        expect(remainingNotes).toHaveLength(0);
    });
});
