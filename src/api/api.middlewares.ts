import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';

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
