import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

export async function postRegister(req: Request, res: Response) {
	return res.status(StatusCodes.OK).json({
		message: 'postRegister() ok',
	});
}

export async function postLogin(req: Request, res: Response) {
	return res.status(StatusCodes.OK).json({
		message: 'postLogin() ok',
	});
}
