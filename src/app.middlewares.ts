import { Request, Response, NextFunction } from 'express';

export class AppMiddlewares {
	public static notFoundHandler(req: Request, res: Response, next: NextFunction) {
		return res.status(404).send({
			message: 'Resource not found',
		});
	}

	public static errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
		return res.status(500).send({
			message: 'Internal server error',
		});
	}
}
