import { faker } from '@faker-js/faker';
import db from '../db';

export async function userSeeder() {
	try {
		console.log('Dropping existing records...');
		// Delete existing records
		await db.user.deleteMany();

		console.log('Creating new seeders...');
		// Generate new seeders
		const usersData = Array.from({ length: 10 }, () => ({
			username: faker.internet.userName(),
			email: faker.internet.email(),
			password: faker.internet.password(),
			verified: faker.datatype.boolean(),
			verified_at: faker.date.recent(),
			created_at: faker.date.past(),
			updated_at: faker.date.recent(),
		}));

		await db.user.createMany({
            data: usersData
		});

		console.log('Seeders created successfully.');
	} catch (error) {
		console.log(error);
	} finally {
		db.$disconnect();
	}
}
