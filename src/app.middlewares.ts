import { Request, Response, NextFunction } from 'express';

export function notFoundHandler(req: Request, res: Response, next: NextFunction) {
	return res.status(404).send({
		message: 'Resource not found',
	});
}

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
	return res.status(500).send({
		message: 'Internal server error',
	});
}
