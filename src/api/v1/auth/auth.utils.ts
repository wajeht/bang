import bcrypt from 'bcryptjs';
import env from '../../../configs/env';

export async function hashPassword(password: string) {
	return await bcrypt.hash(password, env.PASSWORD_SALT);
}

export async function comparePassword(password: string, hashedPassword: string) {
	return await bcrypt.compare(password, hashedPassword);
}
