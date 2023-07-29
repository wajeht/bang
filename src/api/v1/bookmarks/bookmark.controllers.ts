import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import db from '../../../database/db';

import type { getBookmarkSchemaType } from './bookmark.validations';

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

export async function getBookmark(req: Request<getBookmarkSchemaType, {}, {}>, res: Response): Promise<void> {
	const bookmark = await db.bookmark.findUnique({
		where: { id: req.params.id },
	});

	res.status(StatusCodes.OK).json({
		message: 'ok',
		data: [bookmark] ?? [],
	});
}

export async function postBookmark(req: Request, res: Response): Promise<void> {
	res.status(StatusCodes.OK).json({
		message: 'ok',
	});
}

export async function patchBookmark(req: Request, res: Response): Promise<void> {
	res.status(StatusCodes.OK).json({
		message: 'ok',
	});
}

export async function deleteBookmark(req: Request, res: Response): Promise<void> {
	res.status(StatusCodes.OK).json({
		message: 'ok',
	});
}
