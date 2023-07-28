import { vi } from 'vitest';
import * as utils from './auth.utils';
import { JwtPayload } from 'jsonwebtoken';

vi.mock('../../../configs/env', async () => {
	return {
		...((await vi.importActual('../../../configs/env')) as object),
		JWT_SECRET: 'mock-jwt-secret',
		JWT_EXPIRES_IN: '1d',
		PASSWORD_SALT: 'mock-password-salt',
	};
});

describe('verifyJwtToken', () => {
	it('should generate and verify JWT token', async () => {
		const payload = { userId: 123 };
		const token = await utils.generateJwtToken(payload, '1d');
		const decodedToken = (await utils.verifyJwtToken(token)) as JwtPayload;

		delete decodedToken.exp;
		delete decodedToken.iat;

		expect(decodedToken).toEqual(payload);
	});
});

describe('generateJwtToken', () => {
	it('should generate a JWT token', async () => {
		const payload = { userId: 123 };
		const token = await utils.generateJwtToken(payload);

		expect(typeof token).toBe('string');
	});
});

describe('hashPassword and comparePassword', () => {
	it('should hash and compare passwords', async () => {
		const password = 'myPassword';
		const hashedPassword = await utils.hashPassword(password);
		const isMatch = await utils.comparePassword(password, hashedPassword);

		expect(isMatch).toBe(true);
	});

	it('should not match incorrect passwords', async () => {
		const password = 'myPassword';
		const incorrectPassword = 'wrongPassword';
		const hashedPassword = await utils.hashPassword(password);
		const isMatch = await utils.comparePassword(incorrectPassword, hashedPassword);

		expect(isMatch).toBe(false);
	});
});

describe('generateRandomToken', () => {
	it('should generate a random token', async () => {
		const token = await utils.generateRandomToken();

		expect(token).toHaveLength(64);
	});
});

describe('generateDay', () => {
	it('should generate a date X days from now', () => {
		const days = 5;
		const expectedDate = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
		const generatedDate = utils.generateDay(`${days}d`);

		expect(generatedDate.toISOString()).toEqual(expectedDate.toISOString());
	});

	it('should throw errors for invalid inputs in generateDay', () => {
		expect(() => utils.generateDay('5')).toThrow('Invalid input format');
		expect(() => utils.generateDay('5a')).toThrow(
			'Invalid input format. Please use the format "Xd", where X is the number of days.',
		);
	});
});
