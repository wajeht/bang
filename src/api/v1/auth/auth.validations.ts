import { z } from 'zod';
import bcrypt from 'bcryptjs';
import db from '../../../database/db';

export const postRegisterSchema = z.object({
	username: z
		.string()
		.min(3)
		.max(255)
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
		.email()
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
	password: z.string().min(8).max(255),
});

export const postForgotPasswordSchema = z.object({
	email: z.string().email(),
});

export const postResetPasswordSchema = z.object({
	password: z.string().min(8).max(255),
	confirmPassword: z.string().min(8).max(255),
});

export const postLoginSchema = z
	.object({
		email: z.string().email(),
		password: z.string().min(8).max(255),
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

export type PostForgotPasswordSchema = z.infer<typeof postForgotPasswordSchema>;
export type PostResetPasswordSchema = z.infer<typeof postResetPasswordSchema>;
export type PostRegisterSchema = z.infer<typeof postRegisterSchema>;
export type PostLoginSchema = z.infer<typeof postLoginSchema>;
