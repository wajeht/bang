import { User, Role } from '../../../types/user';
import db from '../../../database/db';

export async function createUser(
	user: Pick<User, 'email' | 'password' | 'username'>,
): Promise<User> {
	const createdUser = await db.user.create({
		data: {
			email: user.email,
			password: user.password,
			username: user.username,
			role: Role.USER,
		},
	});

	return createdUser;
}
