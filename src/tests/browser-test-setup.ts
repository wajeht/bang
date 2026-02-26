import { createDb } from './test-db';

export default async function globalSetup() {
    if (process.env.CI) {
        console.log('Skipping database setup in CI (already done via npm run db:prepare:dev)');
        return;
    }

    console.log('Setting up test database...');
    const db = createDb();

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
