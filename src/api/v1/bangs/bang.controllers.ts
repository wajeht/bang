import { Request, Response } from 'express';
import env from '../../../configs/env';

export async function getQuery(req: Request, res: Response): Promise<void> {
	const [command, url] = req.query.q.split(' ');

	if (command === '!add') {
		res.redirect(`http://localhost:${env.VUE_PORT}/dashboard/bookmarks?add=${url}`);
	}

	res.status(200).json({
		message: 'ok',
		query: req.query,
	});
}
