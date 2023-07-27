import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

export async function getCommands(req: Request, res: Response): Promise<void> {
	res.status(StatusCodes.OK).json({ message: 'ok' });
}
