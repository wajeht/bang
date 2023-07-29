import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

export async function getBookmarks(req: Request, res: Response): Promise<void> {
	res.status(StatusCodes.OK).json({
		message: 'ok',
	});
}

export async function getBookmark(req: Request, res: Response): Promise<void> {
	res.status(StatusCodes.OK).json({
		message: 'ok',
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
