import { NextFunction, Request, Response } from 'express';
import { AnyZodObject } from 'zod';

export interface RequestValidators {
	params?: AnyZodObject;
	body?: AnyZodObject;
	query?: AnyZodObject;
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
			next(error);
		}
	};
}
