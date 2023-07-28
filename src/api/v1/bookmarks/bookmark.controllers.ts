import { Request, Response } from 'express';
import { StatusCodes } from 'http-status-codes';

export async function getBookmarks(req: Request, res: Response): Promise<void> {
    res.status(StatusCodes.OK).json({ message: 'ok' });
}
