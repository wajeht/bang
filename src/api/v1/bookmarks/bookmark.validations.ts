import { z } from 'zod';
import db from '../../../database/db';

export const getBookmarkSchema = z.object({
	id: z.string().cuid(),
});

export const getBookmarkSchemaExtra = getBookmarkSchema
	.refine(
		async ({ id }) => {
			const bookmark = await db.bookmark.findUnique({
				where: { id },
			});

			return bookmark !== null;
		},
		{
			message: 'Bookmark not found',
		},
	)
	.refine(
		async ({ id }) => {
			const bookmark = await db.bookmark.findUnique({
				where: { id },
			});

			return bookmark?.user_id === global.loggedInUser.id;
		},
		{
			message: 'You are not the owner of this bookmark',
		},
	);

export type getBookmarkSchemaType = z.infer<typeof getBookmarkSchema>;
