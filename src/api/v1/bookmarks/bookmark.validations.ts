import { z } from 'zod';
import db from '../../../database/db';
import { ForbiddenError, NotFoundError } from '../../api.errors';

export const getBookmarkSchema = z.object({
	id: z.string().cuid(),
});

export const getBookmarkSchemaExtra = getBookmarkSchema
	.refine(async ({ id }) => {
		const bookmark = await db.bookmark.findFirst({
			where: { id },
		});

		if (bookmark === null) {
			throw new NotFoundError('Bookmark not found');
		}

		return true;
	})
	.refine(async ({ id }) => {
		const bookmark = await db.bookmark.findUnique({
			where: { id },
		});

		if (bookmark?.user_id !== global.loggedInUser.id) {
			throw new ForbiddenError('You are not the owner of this bookmark');
		}

		return true;
	});

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

export const postBookmarkSchemaExtra = postBookmarkSchema.refine(async ({ user_id }) => {
	const user = await db.user.findFirst({
		where: { id: user_id },
	});

	if (user === null) {
		throw new NotFoundError('User not found');
	}

	return true;
});

export const deleteBookmarkParamsSchema = z.object({
	id: z.string().cuid(),
});

export const deleteBookmarkBodySchema = z.object({
	user_id: z.string().cuid(),
});

export const deleteBookmarkSchemaExtra = z
	.object({
		...deleteBookmarkParamsSchema.shape,
		...deleteBookmarkBodySchema.shape,
	})
	.refine(async ({ id, user_id }) => {
		const bookmark = await db.bookmark.findFirst({
			where: { id },
		});

		if (bookmark === null) {
			throw new NotFoundError('Bookmark not found');
		}

		if (bookmark.user_id !== user_id) {
			throw new ForbiddenError('You are not the owner of this bookmark');
		}

		return true;
	});

export const patchBookmarkParamsSchema = z.object({
	id: z.string().cuid(),
});

export const patchBookmarkBodySchema = z.object({
	user_id: z.string().cuid(),
	title: z.string().min(3, 'Title must be at least 3 characters').optional(),
	url: z.string().url('Invalid URL format').optional(),
	description: z.string().min(3, 'Description must be at least 3 characters').optional(),
	favicon_url: z.string().url('Invalid URL format').optional(),
	image_url: z.string().url('Invalid URL format').optional(),
});

export const patchBookmarkSchemaExtra = z
	.object({
		...patchBookmarkParamsSchema.shape,
		...patchBookmarkBodySchema.shape,
	})
	.refine(async ({ id, user_id }) => {
		const bookmark = await db.bookmark.findFirst({
			where: { id },
		});

		if (bookmark === null) {
			throw new NotFoundError('Bookmark not found');
		}

		if (bookmark.user_id !== user_id) {
			throw new ForbiddenError('You are not the owner of this bookmark');
		}

		return true;
	});

export type getBookmarkSchemaType = z.infer<typeof getBookmarkSchema>;
export type postBookmarkSchemaType = z.infer<typeof postBookmarkSchema>;
export type deleteBookmarkBodySchemaType = z.infer<typeof deleteBookmarkBodySchema>;
export type deleteBookmarkParamsSchemaType = z.infer<typeof deleteBookmarkParamsSchema>;
export type patchBookmarkBodySchemaType = z.infer<typeof patchBookmarkBodySchema>;
export type patchBookmarkParamsSchemaType = z.infer<typeof patchBookmarkParamsSchema>;
