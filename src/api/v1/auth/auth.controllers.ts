import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import * as AuthServices from './auth.services';

import type { PostRegisterSchema } from './auth.validations';

export async function postRegister(req: Request<{}, {}, PostRegisterSchema>, res: Response) {
	const user = await AuthServices.createUser(req.body);
	return res.status(StatusCodes.OK).json({
		message: 'postRegister() ok',
	});
}

export async function postLogin(req: Request, res: Response) {
	return res.status(StatusCodes.OK).json({
		message: 'postLogin() ok',
	});
}

export async function postForgotPassword(req: Request, res: Response) {
	return res.status(StatusCodes.OK).json({
		message: 'postLogin() ok',
	});
}

export async function postResetPassword(req: Request, res: Response) {
	return res.status(StatusCodes.OK).json({
		message: 'postLogin() ok',
	});
}
