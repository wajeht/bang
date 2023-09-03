import { User } from '../../../types/user';
import { hashPassword, generateRandomToken } from './auth.utils';
import { VERIFICATION_TOKEN_EXPIRES_AT, RESET_PASSWORD_TOKEN_EXPIRES_AT } from './auth.enums';

import db from '../../../database/db';

export async function createUser(user: Pick<User, 'email' | 'password' | 'username'>) {
	const hashedPassword = await hashPassword(user.password);
	const verificationToken = await generateRandomToken();

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

export async function setUserResetPasswordToken(email: string) {
	const resetPasswordToken = await generateRandomToken();

	const foundUser = await db.user.findUnique({
		where: {
			email,
		},
	});

	if (!foundUser) {
		return null;
	}

	const updatedUser = await db.user.update({
		where: {
			email,
		},
		data: {
			reset_password_token: resetPasswordToken,
			reset_password_token_expires_at: RESET_PASSWORD_TOKEN_EXPIRES_AT,
		},
	});

	return updatedUser;
}

export async function resetUserPassword(email: string, password: string) {
	const hashedPassword = await hashPassword(password);

	const updatedUser = await db.user.update({
		where: {
			email,
		},
		data: {
			password: hashedPassword,
			reset_password_token: null,
			reset_password_token_expires_at: null,
		},
	});

	return updatedUser;
}
