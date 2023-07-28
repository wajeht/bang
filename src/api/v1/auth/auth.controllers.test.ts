import { StatusCodes } from 'http-status-codes';
import { it, expect, describe, vi } from 'vitest';
import { postRegister } from './auth.controllers';
import { createUser } from './auth.services';
import * as mail from '../../../services/emails';

vi.mock('./auth.services', async () => ({
	createUser: vi.fn(),
}));

vi.mock('../../../services/emails', () => ({
	sendVerifyEmail: vi.fn(),
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
