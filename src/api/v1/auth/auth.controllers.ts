import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

import * as AuthServices from './auth.services';
import * as AuthUtils from './auth.utils';

import mail from '../../../services/emails';
import db from '../../../database/db';
import env from '../../../configs/env';

import type { PostRegisterSchema, PostVerifyEmailSchema } from './auth.validations';

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

	res.status(StatusCodes.OK).json({ message: 'ok' });
}

export async function postLogin(req: Request, res: Response): Promise<void> {
	const remember = req.body.remember;

	const user = await db.user.findFirst({
		where: {
			email: req.body.email,
		},
	});

	const payload = {
		id: user!.id,
		email: user!.email,
		username: user!.username,
		role: user!.role,
		profile_picture_url: user!.profile_picture_url,
	};

	const token = await AuthUtils.generateJwtToken(payload, remember ? '7d' : '1d');

	res.cookie('token', token, {
		httpOnly: true,
		secure: env.NODE_ENV === 'production',
		signed: true,
		expires: remember ? AuthUtils.generateDay('7d') : AuthUtils.generateDay('1d'),
	});

	res.status(StatusCodes.OK).json({ message: 'ok' });
}

export async function postForgotPassword(req: Request, res: Response): Promise<void> {
	const user = await AuthServices.setUserResetPasswordToken(req.body.email);

	if (user) {
		await mail.sendResetPassword({
			email: user.email,
			token: user.reset_password_token!,
			name: user.username,
		});
	}

	res.status(StatusCodes.OK).json({ message: 'ok' });
}

export async function postResetPassword(req: Request, res: Response): Promise<void> {
	await AuthServices.resetUserPassword(req.body.email, req.body.password);
	res.status(StatusCodes.OK).json({ status: true });
}

export async function postVerifyEmail(
	req: Request<{}, {}, PostVerifyEmailSchema>,
	res: Response,
): Promise<void> {
	await db.user.update({
		where: {
			email: req.body.email,
		},
		data: {
			verified: true,
			verified_at: new Date(),
			verification_token: null,
			verification_token_expires_at: null,
		},
	});

	res.status(StatusCodes.OK).json({ message: 'ok' });
}

export async function postLogout(req: Request, res: Response): Promise<void> {
	res.clearCookie('token');
	res.status(StatusCodes.OK).json({ message: 'ok' });
}
