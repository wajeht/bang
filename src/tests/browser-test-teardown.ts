import { db } from './test-setup';

async function globalTeardown() {
    console.log('Cleaning up test resources...');

    try {
        await db.destroy();
        console.log('Database connections closed successfully');
    } catch (error) {
        console.error('Error during teardown:', error);
    }
}

export default globalTeardown;
