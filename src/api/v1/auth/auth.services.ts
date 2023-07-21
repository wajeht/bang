import { User } from '../../../types/user';

import bcrypt from 'bcryptjs';
import db from '../../../database/db';

export async function hashPassword(password: string) {
	return await bcrypt.hash(password, 10);
}

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
