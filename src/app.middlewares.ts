import path from 'path';
import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';

export function vueHandler(req: Request, res: Response, next: NextFunction) {
	try {
		const vue = path.resolve(path.join(process.cwd(), 'public', 'index.html'));
		res.setHeader('Content-Type', 'text/html');
		return res.status(StatusCodes.OK).sendFile(vue);
	} catch (e) {
		next(e);
	}
}

export function notFoundHandler(req: Request, res: Response, next: NextFunction) {
	return res.status(StatusCodes.NOT_FOUND).send({
		message: 'Resource not found',
	});
}

export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction) {
	return res.status(StatusCodes.INTERNAL_SERVER_ERROR).send({
		message: 'Internal server error',
	});
}
