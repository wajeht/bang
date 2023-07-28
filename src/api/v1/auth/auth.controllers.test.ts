import { StatusCodes } from 'http-status-codes';
import { it, expect, describe, vi } from 'vitest';
import { postRegister } from './auth.controllers';
import { createUser } from './auth.services';
import mail from '../../../services/emails';

vi.mock('./auth.services', async () => ({
	createUser: vi.fn().mockReturnValue({
		id: '123',
		email: 'test@example.com',
		token: 'verification_token',
		name: 'test',
	}),
}));

vi.mock('../../../services/emails', async () => {
	const actual = (await vi.importActual('../../../services/emails')) as object;
	return {
		...actual,
		sendVerifyEmail: vi.fn(),
	};
});

describe('postRegister', () => {
	it('should register a user', async () => {
		const req: any = {
			body: {
				username: 'test',
				email: '',
				password: '',
			},
		};

		const res: any = {
			json: vi.fn(),
			status: vi.fn().mockReturnThis(),
		};

		mail.sendMail.mockResolvedValue();

		const result = await postRegister(req, res);

		expect(createUser).toHaveBeenCalledWith(req.body);
		expect(mail.sendVerifyEmail).toHaveBeenCalledWith({
			email: 'test@example.com',
			token: 'verification_token',
			name: 'test',
		});

		expect(res.status).toHaveBeenCalledWith(StatusCodes.OK);
		expect(res.json).toHaveBeenCalledWith({ message: 'ok' });

		expect(result).toEqual({ message: 'ok' });
	});
});
