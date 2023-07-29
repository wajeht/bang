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

export const postBookmarkSchema = z.object({
	title: z
		.string()
		.min(3, 'Title must be at least 3 characters')
		.max(255, 'Title must not exceed 255 characters'),
	url: z.string().url('Invalid URL format'),
	user_id: z.string().cuid(),
	description: z.string().min(3, 'Description must be at least 3 characters').optional(),
	favicon_url: z.string().url('Invalid URL format').optional(),
	image_url: z.string().url('Invalid URL format').optional(),
});

export const postBookmarkSchemaExtra = postBookmarkSchema.refine(
	async ({ user_id }) => {
		const user = await db.user.findUnique({
			where: { id: user_id },
		});

		return user !== null;
	},
	{
		message: 'User not found',
	},
);

export type getBookmarkSchemaType = z.infer<typeof getBookmarkSchema>;
export type postBookmarkSchemaType = z.infer<typeof postBookmarkSchema>;
