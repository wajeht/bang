import { libs } from '../libs';
import { config } from '../config';
import { Database } from '../db/db';
import { Logger } from '../utils/logger';

const logger = Logger();

async function globalSetup() {
    // In CI, migrations are run via `npm run db:prepare:dev` before playwright starts
    // Skip here to avoid duplicate work and TypeScript import issues with plain Node.js
    if (process.env.CI) {
        console.log('Skipping database setup in CI (already done via npm run db:prepare:dev)');
        return;
    }

    console.log('Setting up test database...');

    const database = Database({ config, logger, libs });
    const db = database.instance;

    try {
        await db.migrate.latest();
        console.log('Database migrations completed successfully');

        await db.seed.run();
        console.log('Database seeding completed successfully');
    } catch (error) {
        console.error('Error setting up test database:', error);
        throw error;
    }
}

export default globalSetup;
