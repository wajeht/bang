import { db } from '../../db/db';

async function globalSetup() {
    console.log('Setting up test database...');

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
