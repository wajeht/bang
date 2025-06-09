import { db } from './db/db';
import { logger } from './logger';
import { Request, Response } from 'express';
import { getHealthzHandler, postExportDataHandler } from './handler';
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

        const existingActionTypes = await db('action_types').select('*');
        if (existingActionTypes.length === 0) {
            await db('action_types').insert([
                { name: 'search' },
                { name: 'redirect' },
                { name: 'bookmark' },
            ]);
        }

        const [user] = await db('users').insert({
            username: 'testuser',
            email: 'test@example.com',
            is_admin: false,
            default_search_provider: 'duckduckgo',
        }).returning('*');

        testUserId = user.id;

        req = {
            user: {
                id: testUserId,
                username: 'testuser',
                email: 'test@example.com',
                is_admin: false,
                default_search_provider: 'duckduckgo',
                bookmarks_per_page: 10,
                actions_per_page: 10,
                api_key: 'test-key',
                api_key_version: 1,
                api_key_created_at: '2023-01-01',
                column_preferences: {
                    bookmarks: { title: true, url: true, created_at: true, default_per_page: 10 },
                    actions: {
                        name: true,
                        trigger: true,
                        url: true,
                        created_at: true,
                        default_per_page: 10,
                    },
                    notes: {
                        title: true,
                        content: true,
                        created_at: true,
                        default_per_page: 10,
                        view_type: 'table',
                    },
                },
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
        await db('notes').where({ user_id: testUserId }).delete();
        await db('bookmarks').where({ user_id: testUserId }).delete();
        await db('bangs').where({ user_id: testUserId }).delete();
        await db('users').where({ id: testUserId }).delete();
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

        const handler = postExportDataHandler.handler(db, logger);
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

        const handler = postExportDataHandler.handler(db, logger);
        await handler(req as Request, res as Response);

        const sentData = (res.send as any).mock.calls[0][0];
        const exportData = JSON.parse(sentData);

        expect(exportData.bookmarks).toBeDefined();
        expect(exportData.bookmarks).toHaveLength(1);
        expect(exportData.actions).toBeUndefined();
        expect(exportData.notes).toBeUndefined();
    });

    it('should handle empty data gracefully', async () => {
        const handler = postExportDataHandler.handler(db, logger);
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
        const handler = postExportDataHandler.handler(db, logger);
        await handler(req as Request, res as Response);

        const sentData = (res.send as any).mock.calls[0][0];
        const exportData = JSON.parse(sentData);

        expect(exportData.exported_at).toBeDefined();
        expect(exportData.version).toBe('1.0');
        expect(new Date(exportData.exported_at)).toBeInstanceOf(Date);
    });

    it('should set correct response headers', async () => {
        const handler = postExportDataHandler.handler(db, logger);
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
            { user_id: testUserId, trigger: '!test1', name: 'Action 1', url: 'https://action1.com', action_type_id: actionType.id },
            { user_id: testUserId, trigger: '!test2', name: 'Action 2', url: 'https://action2.com', action_type_id: actionType.id },
        ]);

        await db('notes').insert([
            { user_id: testUserId, title: 'Note 1', content: 'Content 1' },
            { user_id: testUserId, title: 'Note 2', content: 'Content 2' },
        ]);

        const handler = postExportDataHandler.handler(db, logger);
        await handler(req as Request, res as Response);

        const sentData = (res.send as any).mock.calls[0][0];
        const exportData = JSON.parse(sentData);

        expect(exportData.bookmarks).toHaveLength(2);
        expect(exportData.actions).toHaveLength(2);
        expect(exportData.notes).toHaveLength(2);
    });
});
