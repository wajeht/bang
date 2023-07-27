import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

import env from '../../../configs/env';

export async function verifyJwtToken(token: string) {
	return jwt.verify(token, env.JWT_SECRET);
}

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

export function generateDay(day: string) {
	if (!day || typeof day !== 'string') {
		throw new Error(
			'Invalid input. Please provide a valid string representing the number of days (e.g., "7d", "1d", "30d").',
		);
	}

	const match = day.match(/^(\d+)d$/);
	if (!match) {
		throw new Error(
			'Invalid input format. Please use the format "Xd", where X is the number of days.',
		);
	}

	const days = parseInt(match[1]);
	if (isNaN(days)) {
		throw new Error('Invalid input. Please provide a valid number in the string.');
	}

	const millisecondsPerDay = 24 * 60 * 60 * 1000;
	const newDate = new Date(Date.now() + days * millisecondsPerDay);
	return newDate;
}
