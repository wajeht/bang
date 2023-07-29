/* eslint-disable @typescript-eslint/no-unused-vars */
import path from 'path';

import { Request, Response, NextFunction } from 'express';
import { StatusCodes } from 'http-status-codes';
import { ZodError } from 'zod';
import {
	NotFoundError,
	ForbiddenError,
	UnauthorizedError,
	ValidationError,
} from './api/api.errors';

import env from './configs/env';

export interface CustomResponse {
	status: boolean;
	statusCode: number;
	requestUrl: string;
	message: string;
	data: unknown;
	error?: unknown;
}

export function vueHandler(req: Request, res: Response, next: NextFunction) {
	try {
		const vue = path.resolve(path.join(process.cwd(), 'public', 'index.html'));
		res.setHeader('Content-Type', 'text/html');
		return res.status(StatusCodes.OK).sendFile(vue);
	} catch (e) {
		next(e);
	}
}

export function apiNotFoundHandle(req: Request, res: Response, next: NextFunction) {
	const resonse: CustomResponse = {
		status: false,
		statusCode: StatusCodes.NOT_FOUND,
		requestUrl: req.originalUrl,
		message: 'Resource not found',
		data: [],
	};

	const { statusCode, ...rest } = resonse;

	const isApiPrefix = req.url.match(/^\/api\/v\d\//) || req.url.match(/^\/api\//);

	if (isApiPrefix) {
		return res.status(statusCode).send(rest);
	}

	next();
}

export function notFoundHandler(req: Request, res: Response, next: NextFunction) {
	const resonse: CustomResponse = {
		status: false,
		statusCode: StatusCodes.NOT_FOUND,
		requestUrl: req.originalUrl,
		message: 'Resource not found',
		data: [],
	};

	const { statusCode, ...rest } = resonse;

	return res.status(statusCode).send(rest);
}

export function errorHandler(
	err: Error,
	req: Request,
	res: Response,
	next: NextFunction,
): Response {
	const response: CustomResponse = {
		status: false,
		statusCode: StatusCodes.INTERNAL_SERVER_ERROR,
		requestUrl: req.originalUrl,
		message: 'Internal server error',
		data: [],
	};

	if (err instanceof ZodError) {
		response.message = 'Validation error';
		response.statusCode = StatusCodes.UNPROCESSABLE_ENTITY;
		response.error = err.issues;
	}

	if (err instanceof NotFoundError) {
		response.message = err.message;
		response.statusCode = err.statusCode;
	}

	if (err instanceof ForbiddenError) {
		response.message = err.message;
		response.statusCode = err.statusCode;
	}

	if (err instanceof UnauthorizedError) {
		response.message = err.message;
		response.statusCode = err.statusCode;
	}

	if (err instanceof ValidationError) {
		response.message = err.message;
		response.statusCode = err.statusCode;
	}

	if (env.NODE_ENV == 'development') {
		response.message = err.message;
		// not instance of zod err
		if (!(err instanceof ZodError)) {
			response.error = err.stack;
		}
	}

	const { statusCode, ...rest } = response;
	return res.status(statusCode).send(rest);
}
