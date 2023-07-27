import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

import env from '../../../configs/env';

export async function generateJwtToken(payload: any, expiresIn?: string) {
	return jwt.sign(payload, env.JWT_SECRET, {
		expiresIn: expiresIn ?? env.JWT_EXPIRES_IN,
	});
}

export async function hashPassword(password: string) {
	return await bcrypt.hash(password, env.PASSWORD_SALT);
}

export async function comparePassword(password: string, hashedPassword: string) {
	return await bcrypt.compare(password, hashedPassword);
}

export async function generateRandomToken() {
	return crypto.randomBytes(32).toString('hex');
}
