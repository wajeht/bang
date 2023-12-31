import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import db from '../../../database/db';
import { screenshot, uploadFile } from '../../../utils';

import type {
	getBookmarkSchemaType,
	postBookmarkSchemaType,
	deleteBookmarkBodySchemaType,
	deleteBookmarkParamsSchemaType,
	patchBookmarkBodySchemaType,
	patchBookmarkParamsSchemaType,
} from './bookmark.validations';

export async function getBookmarks(req: Request, res: Response): Promise<void> {
	const user = await db.user.findUnique({
		where: { id: req.user.id },
		include: {
			bookmarks: {
				orderBy: {
					created_at: 'desc',
				},
			},
		},
	});

	res.status(StatusCodes.OK).json({
		message: 'ok',
		data: user?.bookmarks ?? [],
	});
}

export async function getBookmark(
	req: Request<getBookmarkSchemaType>,
	res: Response,
): Promise<void> {
	const bookmark = await db.bookmark.findUnique({
		where: { id: req.params.id },
	});

	res.status(StatusCodes.OK).json({
		message: 'ok',
		data: [bookmark] ?? [],
	});
}

export async function postBookmark(
	req: Request<unknown, unknown, postBookmarkSchemaType>,
	res: Response,
): Promise<void> {
	const bookmark = await db.bookmark.create({
		data: {
			title: req.body.title,
			url: req.body.url,
			user_id: req.body.user_id,
			description: req.body.description ?? null,
			favicon_url: req.body.favicon_url ?? null,
			image_url: req.body.image_url ?? null,
		},
	});

	let image_url: string;

	image_url = await screenshot(bookmark.url);

	image_url = await uploadFile(image_url, `${bookmark.id}.png`);

	await db.bookmark.update({
		where: { id: bookmark.id },
		data: {
			image_url,
		},
	});

	res.status(StatusCodes.OK).json({
		message: 'ok',
		data: [bookmark],
	});
}

export async function deleteBookmark(
	req: Request<deleteBookmarkParamsSchemaType, unknown, deleteBookmarkBodySchemaType>,
	res: Response,
): Promise<void> {
	const bookmark = await db.bookmark.delete({
		where: { id: req.params.id, user_id: req.body.user_id },
	});

	res.status(StatusCodes.OK).json({
		message: 'ok',
		data: [bookmark],
	});
}

export async function patchBookmark(
	req: Request<patchBookmarkParamsSchemaType, unknown, patchBookmarkBodySchemaType>,
	res: Response,
): Promise<void> {
	const bookmark = await db.bookmark.update({
		where: { id: req.params.id, user_id: req.body.user_id },
		data: {
			title: req.body.title ?? undefined,
			url: req.body.url ?? undefined,
			description: req.body.description ?? undefined,
			favicon_url: req.body.favicon_url ?? undefined,
			image_url: req.body.image_url ?? undefined,
		},
	});

	res.status(StatusCodes.OK).json({
		message: 'ok',
		data: [bookmark],
	});
}
