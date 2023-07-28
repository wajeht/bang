/* eslint-disable @typescript-eslint/no-explicit-any */
import { StatusCodes } from 'http-status-codes';
import { it, expect, describe, vi } from 'vitest';
import { postRegister, postForgotPassword } from './auth.controllers';
import { createUser, setUserResetPasswordToken } from './auth.services';
import * as mail from '../../../services/emails';

vi.mock('./auth.services', async () => ({
	createUser: vi.fn(),
	setUserResetPasswordToken: vi.fn(),
}));

vi.mock('../../../services/emails', () => ({
	sendVerifyEmail: vi.fn(),
	sendResetPassword: vi.fn(),
}));

describe('postRegister', () => {
	it('should register a user', async () => {
		const req: any = { body: { username: 'test', email: '', password: '' } };
		const res: any = { json: vi.fn(), status: vi.fn().mockReturnThis() };

		await createUser.mockResolvedValue({
			email: 'email@domain.com',
			verification_token: 'verification_token',
			username: 'jaw',
		});

		await postRegister(req, res);

		expect(createUser).toHaveBeenCalledWith(req.body);
		expect(mail.sendVerifyEmail).toHaveBeenCalledWith({
			email: 'email@domain.com',
			token: 'verification_token',
			name: 'jaw',
		});

		expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
		expect(res.json).toHaveBeenCalledWith({ message: 'ok' });
	});
});

describe('postForgotPassword', () => {
	it('should be able to send reset password email', async () => {
		const req: any = { body: { email: 'jaw@email.com' } };
		const res: any = { json: vi.fn(), status: vi.fn().mockReturnThis() };

		await setUserResetPasswordToken.mockResolvedValue({
			email: 'email@domail.com',
			reset_password_token: 'reset_password_token',
			username: 'jaw',
		});

		await postForgotPassword(req, res);

		expect(setUserResetPasswordToken).toHaveBeenCalledWith(req.body.email);

		expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
		expect(res.json).toHaveBeenCalledWith({ message: 'ok' });
	});
});
