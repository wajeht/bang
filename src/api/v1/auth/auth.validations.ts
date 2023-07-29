import { z, ZodError } from 'zod';
import bcrypt from 'bcryptjs';
import db from '../../../database/db';

export const postRegisterSchema = z.object({
	username: z
		.string()
		.min(3, 'Username must be at least 3 characters')
		.max(255, 'Username must not exceed 255 characters'),
	email: z.string().email('Invalid email format'),
	password: z
		.string()
		.min(3, 'Password must be at least 3 characters')
		.max(255, 'Password must not exceed 255 characters'),
});

export const postRegisterSchemaExtra = postRegisterSchema
	.refine(
		async ({ username }) => {
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
	)
	.refine(
		async ({ email }) => {
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
	);

export const postForgotPasswordSchema = z.object({
	email: z.string().email('Invalid email format'),
});

export const postForgotPasswordSchemaExtra = postForgotPasswordSchema.refine(async ({ email }) => {
	const foundUser = await db.user.findFirst({
		where: {
			email: email as unknown as string,
		},
	});

	if (foundUser?.verified === false) {
		throw new ZodError([
			{
				path: ['alert'],
				message: 'You have not verified your email!',
				code: 'custom',
			},
		]);
	}

	return true;
});

export const postResetPasswordSchema = z.object({
	password: z
		.string()
		.min(3, 'Password must be at least 3 characters')
		.max(255, 'Password must not exceed 255 characters'),
	confirmPassword: z
		.string()
		.min(3, 'Confirm Password must be at least 3 characters')
		.max(255, 'Confirm Password must not exceed 255 characters'),
	email: z.string().email('Invalid email format'),
	token: z.string(),
});

export const postResetPasswordSchemaExtra = postResetPasswordSchema
	.refine(({ password, confirmPassword }) => {
		if (password !== confirmPassword) {
			throw new ZodError([
				{
					path: ['alert'],
					message: 'Your passwords do not match!',
					code: 'custom',
				},
			]);
		}

		return true;
	})
	.refine(async ({ email, token }) => {
		const foundUser = await db.user.findFirst({
			where: {
				email,
				reset_password_token: token,
			},
		});

		if (!foundUser) {
			throw new ZodError([
				{
					path: ['alert'],
					message: 'Invalid email or token!',
					code: 'custom',
				},
			]);
		}

		return true;
	})
	.refine(async ({ email, token }) => {
		// check to see if token has expire
		const foundUser = await db.user.findFirst({
			where: {
				email,
				reset_password_token: token,
			},
		});

		let tokenExpired: boolean | null;

		if (foundUser && foundUser.reset_password_token_expires_at) {
			tokenExpired =
				new Date().getTime() - foundUser.reset_password_token_expires_at.getTime() > 10 * 60 * 1000;

			if (tokenExpired) {
				throw new ZodError([{ path: ['alert'], message: 'Token has expired!', code: 'custom' }]);
			}

			return true;
		}
	});

export const postLoginSchema = z.object({
	email: z.string().email('Invalid email format'),
	password: z
		.string()
		.min(3, 'Password must be at least 3 characters')
		.max(255, 'Password must not exceed 255 characters'),
	remember: z.boolean().optional().default(false),
});

export const postLoginSchemaExtra = postLoginSchema.refine(async ({ email, password }) => {
	const unverifiedUser = await db.user.findFirst({
		where: {
			email,
			verified: false,
		},
	});

	if (unverifiedUser) {
		throw new ZodError([
			{
				path: ['alert'],
				message: 'You have not verified your email!',
				code: 'custom',
			},
		]);
	}

	const verifiedFoundUser = await db.user.findUnique({
		where: {
			email,
			verified: true,
		},
	});

	if (!verifiedFoundUser) {
		throw new ZodError([
			{
				path: ['alert'],
				message: 'Email or password is incorrect',
				code: 'custom',
			},
		]);
	}

	try {
		const passwordMatch = await bcrypt.compare(password, verifiedFoundUser.password);
		if (!passwordMatch) {
			throw new ZodError([
				{
					path: ['alert'],
					message: 'Email or password is incorrect',
					code: 'custom',
				},
			]);
		}
	} catch (error) {
		throw new ZodError([
			{
				path: ['alert'],
				message: 'Email or password is incorrect',
				code: 'custom',
			},
		]);
	}

	return true;
});

export const postVerifyEmailSchema = z.object({
	token: z.string(),
	email: z.string().email('Invalid email format'),
});

export const postVerifyEmailSchemaExtra = postVerifyEmailSchema
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
					path: ['alert'],
					message: 'You have already verified your email!',
					code: 'custom',
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
				throw new ZodError([{ path: ['alert'], message: 'Token has expired!', code: 'custom' }]);
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
			throw new ZodError([{ path: ['alert'], message: 'Invalid email or token!', code: 'custom' }]);
		}

		return true;
	});

export type PostForgotPasswordSchema = z.infer<typeof postForgotPasswordSchema>;
export type PostResetPasswordSchema = z.infer<typeof postResetPasswordSchema>;
export type PostRegisterSchema = z.infer<typeof postRegisterSchema>;
export type PostLoginSchema = z.infer<typeof postLoginSchema>;
export type PostVerifyEmailSchema = z.infer<typeof postVerifyEmailSchema>;
