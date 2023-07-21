import { User } from '../../../types/user';
import db from '../../../database/db';
import { ValidationError } from '../../../api/api.errors';

export async function createUser(user: Pick<User, 'email' | 'password' | 'username'>) {
	const foundUser = await db.user.findUnique({
		where: {
			email: user.email,
		},
	});

	if (foundUser) {
		throw new ValidationError('User already exists');
	}

	const createdUser = await db.user.create({
		data: {
			email: user.email,
			password: user.password,
			username: user.username,
		},
	});

	return createdUser;
}
