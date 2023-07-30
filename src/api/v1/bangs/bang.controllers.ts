import { Request, Response } from 'express';

export async function getQuery(req: Request, res: Response): Promise<void> {
	res.status(200).json({
		message: 'ok',
		query: req.query,
	});
}
