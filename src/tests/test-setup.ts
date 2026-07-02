process.env.APP_ENV = 'testing';
process.env.NODE_ENV = 'testing';

import { createApp } from '../app.js';
import { Log } from '../utils/logger.js';
import { beforeAll, beforeEach, afterAll } from 'vite-plus/test';
import { createDb, createUser, cleanupTables } from './test-db.js';
import type { AppEnv } from '../http.js';
import type { AppContext } from '../type.js';
import type { Hono } from 'hono';

Log.setLevel('SILENT');

export const db = createDb();
export let app: Hono<AppEnv>;
export let ctx: AppContext;

export const createTestUser = (email: string, isAdmin = false) =>
    createUser(db, email, { isAdmin });

beforeAll(async () => {
    await db.migrate.latest();
    if (!app) {
        const created = await createApp();
        ctx = created.ctx;
        app = created.app;
    }
});

beforeEach(async () => {
    await cleanupTables(db);
    await createUser(db, 'test@example.com', { id: 1, username: 'testuser' });
});

afterAll(async () => {
    await db.destroy();
});
