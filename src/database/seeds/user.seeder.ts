import { faker } from '@faker-js/faker';
import db from '../db';
import { hashPassword } from '../../api/v1/auth/auth.utils';

export async function userSeeder() {
	try {
		console.log('Dropping existing user records...');
		// Delete existing records
		await db.user.deleteMany();
		const password = await hashPassword('password');

		console.log('Creating new user seeders...');
		// Generate new seeders
		const usersData = Array.from({ length: 10 }, () => ({
			username: faker.internet.userName(),
			email: faker.internet.email(),
			password,
			verified: faker.datatype.boolean(),
			verified_at: faker.date.recent(),
			created_at: faker.date.past(),
			updated_at: faker.date.recent(),
		}));

		await db.user.createMany({
			data: usersData,
		});

		console.log('User seeders created successfully.');
	} catch (error) {
		console.log(error);
	} finally {
		db.$disconnect();
	}
}
