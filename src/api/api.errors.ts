import { StatusCodes } from 'http-status-codes';

class HttpError {
  public statusCode: StatusCodes;
	public message: string;
  constructor(statusCode: StatusCodes, message: string) {
    this.statusCode = statusCode;
    this.message = message;
  }
}

export class ForbiddenError extends HttpError {
  constructor(message: string) {
    super(StatusCodes.FORBIDDEN, message);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message: string) {
    super(StatusCodes.UNAUTHORIZED, message);
  }
}

export class NotFoundError extends HttpError {
  constructor(message: string) {
    super(StatusCodes.NOT_FOUND, message);
  }
}

export class APICallsExceededError extends HttpError {
  constructor(message: string) {
    super(StatusCodes.TOO_MANY_REQUESTS, message);
  }
}

export class ValidationError extends HttpError {
  constructor(message: string) {
    super(StatusCodes.UNPROCESSABLE_ENTITY, message);
  }
}
