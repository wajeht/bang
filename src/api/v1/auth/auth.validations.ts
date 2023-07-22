import { z, ZodError } from 'zod';
import bcrypt from 'bcryptjs';
import db from '../../../database/db';

export const postRegisterSchema = z.object({
	username: z
		.string()
		.min(3, 'Username must be at least 3 characters')
		.max(255, 'Username must not exceed 255 characters')
		.refine(
			async (username) => {
				const foundUser = await db.user.findUnique({
					where: {
						username,
					},
				});
				return !foundUser;
			},
			{
				message: 'Username already exists',
			},
		),
	email: z
		.string()
		.email('Invalid email format')
		.refine(
			async (email) => {
				const foundUser = await db.user.findUnique({
					where: {
						email,
					},
				});
				return !foundUser;
			},
			{
				message: 'Email already exists in the database',
			},
		),
	password: z
		.string()
		.min(3, 'Password must be at least 3 characters')
		.max(255, 'Password must not exceed 255 characters'),
});

export const postForgotPasswordSchema = z.object({
	email: z.string().email(),
});

export const postResetPasswordSchema = z
	.object({
		password: z
			.string()
			.min(3, 'Password must be at least 3 characters')
			.max(255, 'Password must not exceed 255 characters'),
		confirmPassword: z
			.string()
			.min(3, 'Confirm Password must be at least 3 characters')
			.max(255, 'Confirm Password must not exceed 255 characters'),
	})
	.refine(
		({ password, confirmPassword }) => {
			return password === confirmPassword;
		},
		{
			message: 'Passwords do not match',
		},
	);

export const postLoginSchema = z
	.object({
		email: z.string().email('Invalid email format'),
		password: z
			.string()
			.min(3, 'Password must be at least 3 characters')
			.max(255, 'Password must not exceed 255 characters'),
	})
	.refine(async ({ email }) => {
		const foundUser = await db.user.findFirst({
			where: {
				email,
				verified: false,
			},
		});

		if (foundUser) {
			throw new ZodError([
				{
					path: [],
					message: 'You have not verified your email!',
					code: 'custom',
				},
			]);
		}

		return true;
	})
	.refine(async ({ email, password }) => {
		const foundUser = await db.user.findUnique({
			where: {
				email,
			},
		});

		if (!foundUser || !(await bcrypt.compare(password, foundUser.password))) {
			throw new ZodError([
				{
					path: ['email'],
					message: 'Email or password is incorrect',
					code: 'custom',
				},
			]);
		}

		return true;
	});

export const postVerifyEmailSchema = z
	.object({
		token: z.string(),
		email: z.string().email('Invalid email format'),
	})
	.refine(async ({ email }) => {
		const foundUser = await db.user.findFirst({
			where: {
				email,
				verified: true,
				verification_token: null,
				verification_token_expires_at: null,
				verified_at: {
					not: null,
				},
			},
		});

		if (foundUser) {
			throw new ZodError([
				{
					path: ['email'],
					message: 'You have already verified your email!',
					code: 'already_verified',
				},
			]);
		}

		return true;
	})
	.refine(async ({ email, token }) => {
		const foundUser = await db.user.findFirst({
			where: {
				email,
				verification_token: token,
			},
		});

		let tokenExpired: boolean | null;

		if (foundUser && foundUser.verification_token_expires_at) {
			tokenExpired =
				new Date().getTime() - foundUser.verification_token_expires_at.getTime() > 10 * 60 * 1000;

			if (tokenExpired) {
				throw new ZodError([
					{ path: ['token'], message: 'Token has expired!', code: 'token_expired' },
				]);
			}

			return true;
		}

		throw new Error('Invalid email or token!'); // Exit on first fail check
	})
	.refine(async ({ email, token }) => {
		const foundUser = await db.user.findUnique({
			where: {
				email,
				verification_token: token,
			},
		});

		if (!foundUser) {
			throw new ZodError([
				{ path: ['email'], message: 'Invalid email or token!', code: 'invalid_email_or_token' },
			]);
		}

		return true;
	});

export type PostForgotPasswordSchema = z.infer<typeof postForgotPasswordSchema>;
export type PostResetPasswordSchema = z.infer<typeof postResetPasswordSchema>;
export type PostRegisterSchema = z.infer<typeof postRegisterSchema>;
export type PostLoginSchema = z.infer<typeof postLoginSchema>;
export type PostVerifyEmailSchema = z.infer<typeof postVerifyEmailSchema>;
