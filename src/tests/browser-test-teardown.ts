import { libs } from '../libs';
import { config } from '../config';
import { Database } from '../db/db';
import { logger } from '../utils/logger';

async function globalTeardown() {
    console.log('Cleaning up test resources...');

    const database = Database({ config, logger, libs });
    const db = database.instance;

    try {
        await db.destroy();
        console.log('Database connections closed successfully');
    } catch (error) {
        console.error('Error during teardown:', error);
    }
}

export default globalTeardown;
