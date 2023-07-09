import path from 'path';
import { Request, Response, NextFunction } from 'express';

export async function vueHandler(req: Request, res: Response, next: NextFunction) {
	try {
		return res.sendFile(path.resolve(path.join(process.cwd(), 'public', 'index.html')));
	} catch (e) {
		next(e);
	}
}

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
