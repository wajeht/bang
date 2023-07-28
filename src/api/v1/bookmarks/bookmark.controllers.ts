import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import { faker } from '@faker-js/faker';

export async function getBookmarks(req: Request, res: Response): Promise<void> {
	res.status(StatusCodes.OK).json({
		message: 'ok',
		data: Array.from({ length: 10 }, () => ({
			id: faker.string.uuid(),
			title: faker.lorem.sentence(),
			url: faker.internet.url(),
			description: faker.lorem.paragraph(),
			image: faker.image.url(),
			createdAt: faker.date.past(),
			updatedAt: faker.date.recent(),
		})),
	});
}
