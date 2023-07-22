import { User } from '../../../types/user';
import { hashPassword, generateToken } from './auth.utils';
import { VERIFICATION_TOKEN_EXPIRES_AT } from './auth.enums';

import db from '../../../database/db';

export async function createUser(user: Pick<User, 'email' | 'password' | 'username'>) {
	const hashedPassword = await hashPassword(user.password);
	const verificationToken = await generateToken();

	const createdUser = await db.user.create({
		data: {
			email: user.email,
			password: hashedPassword,
			username: user.username,
			verification_token: verificationToken,
			verification_token_expires_at: VERIFICATION_TOKEN_EXPIRES_AT,
		},
	});

	return createdUser;
}
