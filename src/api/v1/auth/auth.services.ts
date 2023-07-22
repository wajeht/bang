import { User } from '../../../types/user';
import { hashPassword } from './auth.utils';

import db from '../../../database/db';

export async function createUser(user: Pick<User, 'email' | 'password' | 'username'>) {
	const hashedPassword = await hashPassword(user.password);

	const createdUser = await db.user.create({
		data: {
			email: user.email,
			password: hashedPassword,
			username: user.username,
		},
	});

	return createdUser;
}
