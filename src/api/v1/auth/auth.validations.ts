import { z } from 'zod';
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
	.refine(
		async ({ email, password }) => {
			// Retrieve the user from the database based on the provided email
			const foundUser = await db.user.findUnique({
				where: {
					email,
				},
			});

			// If no user is found, or the password does not match, return false
			if (!foundUser || !(await bcrypt.compare(password, foundUser.password))) {
				return false;
			}

			// If the email and password match, return true
			return true;
		},
		{
			message: 'Email or password is incorrect',
		},
	);

export const postVerifyEmailSchema = z
	.object({
		token: z.string(),
		email: z.string().email('Invalid email format'),
	})
	.refine(
		async ({ email }) => {
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
				return false;
			}

			return true;
		},
		{
			message: 'You have already verified your email!',
		},
	)
	.refine(
		async ({ email, token }) => {
			const foundUser = await db.user.findFirst({
				where: {
					email,
					verification_token: token,
				},
			});

			let tokenExpired: boolean | null;

			if (foundUser && foundUser.verification_token_expires_at) {
				tokenExpired =
					new Date().getTime() - foundUser!.verification_token_expires_at.getTime() >
					10 * 60 * 1000;

				if (tokenExpired) {
					return false;
				}

				return true;
			}
		},
		{
			message: 'Token has expired!',
		},
	)
	.refine(
		async ({ email, token }) => {
			const foundUser = await db.user.findUnique({
				where: {
					email,
					verification_token: token,
				},
			});

			if (!foundUser) {
				return false;
			}

			return true;
		},
		{
			message: 'Invalid email or token!',
		},
	);

export type PostForgotPasswordSchema = z.infer<typeof postForgotPasswordSchema>;
export type PostResetPasswordSchema = z.infer<typeof postResetPasswordSchema>;
export type PostRegisterSchema = z.infer<typeof postRegisterSchema>;
export type PostLoginSchema = z.infer<typeof postLoginSchema>;
export type PostVerifyEmailSchema = z.infer<typeof postVerifyEmailSchema>;
