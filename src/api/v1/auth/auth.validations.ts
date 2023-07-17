import { z } from 'zod';

export const postRegisterSchema = z.object({
	username: z.string().min(3).max(255),
	email: z.string().email(),
	password: z.string().min(8).max(255),
});

export const postLoginSchema = z.object({
	email: z.string().email(),
	password: z.string().min(8).max(255),
});

export type PostRegisterSchema = z.infer<typeof postRegisterSchema>;
export type PostLoginSchema = z.infer<typeof postLoginSchema>;
