import { z } from 'zod';
import db from '../../../database/db';

export const getBookmarkSchema = z.object({
	// id: z.string().cuid()
	id: z.string()
});

export const getBookmarkSchemaExtra = getBookmarkSchema.refine(
	async ({ id }) => {

		const bookmark = await db.bookmark.findUnique({
			where: { id },
		});

		return bookmark !== null;
	},
	{
		message: 'Bookmark not found',
	},
);

export type getBookmarkSchemaType = z.infer<typeof getBookmarkSchema>;
