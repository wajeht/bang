process.env.APP_ENV = 'testing';
process.env.NODE_ENV = 'testing';

import { createApp } from '../app.js';
import { Log } from '../utils/logger.js';
import { beforeAll, beforeEach, afterAll } from 'vite-plus/test';
import { createDb, createUser, cleanupTables } from './test-db.js';
import type { Application } from 'express';
import type { AppContext } from '../type.js';

Log.setLevel('SILENT');

export const db = createDb();
export let app: Application;
export let ctx: AppContext;

export const createTestUser = (email: string, isAdmin = false) =>
    createUser(db, email, { isAdmin });

beforeAll(async () => {
    await db.migrate.latest();
    if (!app) {
        ({ app, ctx } = await createApp());
    }
});

beforeEach(async () => {
    await cleanupTables(db);
    await createUser(db, 'test@example.com', { id: 1, username: 'testuser' });
});

afterAll(async () => {
    await db.destroy();
});
