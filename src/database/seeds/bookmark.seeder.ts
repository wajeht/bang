import { faker } from '@faker-js/faker';
import db from '../db';

export async function bookmarkSeeder() {
    try {
      console.log('Dropping existing bookmark records...');
      await db.bookmark.deleteMany();

      console.log('Creating new bookmark seeders...');

      const users = await db.user.findMany()

      for (const user of users) {
        for (let i = 0; i < 5; i++) {
          await db.bookmark.create({
            data: {
              user: {
                connect: {
                  id: user.id,
                },
              },
              title: faker.lorem.sentence(),
              url: faker.internet.url(),
              description: faker.lorem.paragraph(),
              image_url: faker.image.url(),
            },
          });
        }
      }

      console.log('Bookmark seeders created successfully.');
    } catch (error) {
      console.log(error);
    } finally {
      await db.$disconnect();
    }
  }
