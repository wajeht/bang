import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import * as AuthServices from './auth.services';

import type { PostRegisterSchema } from './auth.validations';

export async function postRegister(
	req: Request<{}, {}, PostRegisterSchema>,
	res: Response,
): Promise<void> {
	await AuthServices.createUser(req.body);

	res.status(StatusCodes.OK).json({
		message: 'postRegister() ok',
	});
}

export async function postLogin(req: Request, res: Response): Promise<void> {
	throw new Error('postRegister() not implemented');
}

export async function postForgotPassword(req: Request, res: Response): Promise<void> {
	throw new Error('postRegister() not implemented');
}

export async function postResetPassword(req: Request, res: Response): Promise<void> {
	throw new Error('postRegister() not implemented');
}

export async function postVerifyEmail(req: Request, res: Response): Promise<void> {
	throw new Error('postRegister() not implemented');
}
