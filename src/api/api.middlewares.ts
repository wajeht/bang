/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from 'express';
import { ZodError, z } from 'zod';
import { UnauthorizedError } from './api.errors';
import * as AuthUtils from '../api/v1/auth/auth.utils';
import { domain } from '../utils';

const DOMAIN = domain();

declare global {
	// eslint-disable-next-line no-var
	var loggedInUser: {
		id: string;
		name: string;
		email: string;
		profile_picture_url: string;
		role: string;
		iat: number;
		exp: number;
	};
}

export interface RequestValidators {
	query?: z.Schema<any>;
	params?: z.Schema<any>;
	body?: z.Schema<any>;
}

export interface ExtraValidators {
	db?: z.Schema<any>;
}

export function validate(validators: RequestValidators & ExtraValidators) {
	return async (req: Request, res: Response, next: NextFunction) => {
		try {
			if (validators.params) {
				req.params = await validators.params.parseAsync(req.params);
			}
			if (validators.body) {
				req.body = await validators.body.parseAsync(req.body);
			}
			if (validators.query) {
				req.query = await validators.query.parseAsync(req.query);
			}
			if (validators.db) {
				await validators.db.parseAsync({ ...req.params, ...req.body, ...req.query });
			}
			next();
		} catch (error) {
			if (error instanceof ZodError) {
				next(error);
			} else {
				next(error);
			}
		}
	};
}

export async function checkAuth(req: Request, res: Response, next: NextFunction) {
	try {
		const token = req.signedCookies['token'];

		if (!token) {
			throw new UnauthorizedError('Unauthorized');
		}

		const payload = await AuthUtils.verifyJwtToken(token);

		// eslint-disable-next-line @typescript-eslint/ban-ts-comment
		// @ts-ignore
		req.user = payload;

		global.loggedInUser = payload as {
			id: string;
			name: string;
			email: string;
			profile_picture_url: string;
			role: string;
			iat: number;
			exp: number;
		};

		next();
	} catch (error) {
		if (req.get('Content-Type') === 'application/json') {
			next(error);
		}

		res.redirect(`/login?redirectUrl=${DOMAIN}/api/v1/search?q=${req.query.q}`);
	}
}
