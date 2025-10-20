process.env.APP_ENV = 'testing';
process.env.NODE_ENV = 'testing';

import { libs } from '../libs';
import { config } from '../config';
import { Database } from '../db/db';
import { Logger } from '../utils/logger';
import { beforeAll, afterAll } from 'vitest';

const logger = Logger();
const database = Database({ config, logger, libs });
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
