interface HttpErrorInterface extends Error {
	statusCode: number;
}

export function HttpError(
	statusCode = 500,
	message = 'oh no, something went wrong!',
): HttpErrorInterface {
	const error = new Error(message) as HttpErrorInterface;
	error.statusCode = statusCode;
	return error;
}

export function ForbiddenError(message = 'forbidden'): HttpErrorInterface {
	return HttpError(403, message);
}

export function UnauthorizedError(message = 'unauthorized'): HttpErrorInterface {
	return HttpError(401, message);
}

export function NotFoundError(message = 'not found'): HttpErrorInterface {
	return HttpError(404, message);
}

export function ValidationError(message = 'validation error'): HttpErrorInterface {
	return HttpError(422, message);
}

export function UnimplementedFunctionError(
	message = 'function not implemented',
): HttpErrorInterface {
	return HttpError(501, message);
}
