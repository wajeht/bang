import { Request, Response } from 'express';

export async function getQuery(req: Request, res: Response) {
	res.status(200).json({
		message: 'ok',
		data: [],
	});
}
