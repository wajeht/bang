import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getHealthzHandler } from './handler';
import { db } from './db/db';
import { Request, Response } from 'express';

vi.mock('./db/db', () => ({
    db: {
        raw: vi.fn(),
    },
}));

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
        (db.raw as any).mockResolvedValueOnce([{ '1': 1 }]);

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

        expect(db.raw).toHaveBeenCalledWith('SELECT 1');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith({ status: 'ok', database: 'connected' });
    });

    it('should return 200 status when database is connected (HTML response)', async () => {
        (db.raw as any).mockResolvedValueOnce([{ '1': 1 }]);

        const handler = getHealthzHandler(db);
        await handler(req as Request, res as Response);

        expect(db.raw).toHaveBeenCalledWith('SELECT 1');
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
        expect(res.send).toHaveBeenCalledWith('<p>ok</p>');
    });

    it('should return 503 status when database connection fails (JSON response)', async () => {
        (db.raw as any).mockRejectedValueOnce(new Error('Database connection error'));

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

        expect(db.raw).toHaveBeenCalledWith('SELECT 1');
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith({
            status: 'error',
            database: 'disconnected',
            message: 'Database connection failed',
        });
    });

    it('should return 503 status when database connection fails (HTML response)', async () => {
        (db.raw as any).mockRejectedValueOnce(new Error('Database connection error'));

        const handler = getHealthzHandler(db);
        await handler(req as Request, res as Response);

        expect(db.raw).toHaveBeenCalledWith('SELECT 1');
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
        expect(res.send).toHaveBeenCalledWith('<p>error: database connection failed</p>');
    });
});
