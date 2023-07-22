import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';
import * as AuthServices from './auth.services';
import mail from '../../../services/emails';

import type { PostRegisterSchema } from './auth.validations';

export async function postRegister(
	req: Request<{}, {}, PostRegisterSchema>,
	res: Response,
): Promise<void> {
	const user = await AuthServices.createUser(req.body);

	await mail.sendVerifyEmail({
		email: user.email,
		token: user.verification_token!,
		name: user.username,
	});

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
