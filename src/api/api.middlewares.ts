/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { UnauthorizedError } from './api.errors';
import * as AuthUtils from '../api/v1/auth/auth.utils';

export interface RequestValidators {
	params?: any;
	body?: any;
	query?: any;
}

export function validate(validators: RequestValidators) {
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

		next();
	} catch (error) {
		const url = req.originalUrl;

		if (!url.includes('/api')) {
			res.redirect('/login');
			return;
		}

		next(error);
	}
}
