import { createDb } from './test-db';

export default async function globalTeardown() {
    console.log('Cleaning up test resources...');

    try {
        await createDb().destroy();
        console.log('Database connections closed successfully');
    } catch (error) {
        console.error('Error during teardown:', error);
    }
}
