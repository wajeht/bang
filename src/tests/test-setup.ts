process.env.APP_ENV = 'testing';
process.env.NODE_ENV = 'testing';

import { db } from '../db/db';
import { beforeAll, afterAll } from 'vitest';

beforeAll(async () => {
    try {
        await db.migrate.latest();
        console.log('Test database migrations completed successfully');
    } catch (error) {
        console.error('Error setting up test database:', error);
        throw error;
    }
});

afterAll(async () => {
    await db.destroy();
});
