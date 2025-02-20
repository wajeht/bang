import { db } from './db';
import { describe, it } from 'vitest';

describe('db', () => {
	it('Should be able to rollback the database', async () => {
		await db.migrate.rollback();
	});

	it('Should be able to migrate the database', async () => {
		await db.migrate.latest();
	});

	it('Should be able to seed the database', async () => {
		await db.seed.run();
	});

	it('Should be able to close the connection', async () => {
		await db.destroy();
	});
});
