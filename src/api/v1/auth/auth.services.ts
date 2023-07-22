import { User } from '../../../types/user';
import { hashPassword, generateToken } from './auth.utils';

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
			verification_token_expires_at: new Date(Date.now() + 10 * 60 * 1000), // 10 min
		},
	});

	return createdUser;
}
