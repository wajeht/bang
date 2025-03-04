process.env.NODE_ENV = 'testing';
process.env.APP_ENV = 'testing';

import { beforeAll, afterAll } from 'vitest';
import { db } from '../db/db';

// Run migrations before tests to set up the in-memory database schema
beforeAll(async () => {
    try {
        await db.migrate.latest();
        console.log('Test database migrations completed successfully');
    } catch (error) {
        console.error('Error running test database migrations:', error);
        throw error;
    }
});

afterAll(async () => {
    await db.destroy();
});
