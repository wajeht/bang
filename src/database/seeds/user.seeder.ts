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
			firstName: faker.person.firstName(),
			lastName: faker.person.lastName(),
			email: faker.internet.email(),
			password: faker.internet.password(),
			role: 'user',
			verified: faker.datatype.boolean(),
			verifiedAt: faker.date.recent(),
			deletedAt: faker.date.recent(),
			profilePictureUrl: faker.image.avatar(),
			createdAt: faker.date.past(),
			updatedAt: faker.date.recent(),
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
