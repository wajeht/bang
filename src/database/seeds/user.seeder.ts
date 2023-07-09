import { faker } from '@faker-js/faker';
import db from '../db';

export async function userSeeder() {
	try {
		console.log('Dropping existing records...');
		// Delete existing records
		await db.users.deleteMany();

		console.log('Creating new seeders...');
		// Generate new seeders
		const usersData = Array.from({ length: 10 }, () => ({
			username: faker.internet.userName(),
			first_name: faker.person.firstName(),
			last_name: faker.person.lastName(),
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: 'user',
			verified: faker.datatype.boolean(),
			verified_at: faker.date.recent(),
			deleted_at: faker.date.recent(),
			profile_picture_url: faker.image.avatar(),
			created_at: faker.date.past(),
			updated_at: faker.date.recent(),
		}));

		await db.users.createMany({
			data: usersData,
		});

		console.log('Seeders created successfully.');
	} catch (error) {
		console.log(error);
	} finally {
		db.$disconnect();
	}
}
