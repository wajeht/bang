/* eslint-disable @typescript-eslint/ban-types */
import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import db from '../../../database/db';

import type {
	getBookmarkSchemaType,
	postBookmarkSchemaType,
	deleteBookmarkBodySchemaType,
	deleteBookmarkParamsSchemaType,
} from './bookmark.validations';

export async function getBookmarks(req: Request, res: Response): Promise<void> {
	const user = await db.user.findUnique({
		where: { id: req.user.id },
		include: {
			bookmarks: true,
		},
	});

	res.status(StatusCodes.OK).json({
		message: 'ok',
		data: user?.bookmarks ?? [],
	});
}

export async function getBookmark(
	req: Request<getBookmarkSchemaType, {}, {}>,
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
	req: Request<{}, {}, postBookmarkSchemaType>,
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

	res.status(StatusCodes.OK).json({
		message: 'ok',
		data: [bookmark],
	});
}

export async function deleteBookmark(
	req: Request<deleteBookmarkParamsSchemaType, {}, deleteBookmarkBodySchemaType>,
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

export async function patchBookmark(req: Request, res: Response): Promise<void> {
	res.status(StatusCodes.OK).json({
		message: 'ok',
	});
}
