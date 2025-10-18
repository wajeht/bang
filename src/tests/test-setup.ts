process.env.APP_ENV = 'testing';
process.env.NODE_ENV = 'testing';

import { beforeAll, afterAll } from 'vitest';
import { config } from '../config';
import { logger } from '../utils/logger';
import { libs } from '../libs';
import { createDatabase } from '../db/db';

const database = createDatabase({ config, logger, libs });
export const db = database.instance;

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
    try {
        await db.destroy();
    } catch (error) {
        console.error('Error cleaning up test database:', error);
        throw error;
    }
});
