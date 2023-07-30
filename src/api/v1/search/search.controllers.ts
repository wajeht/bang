/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Request, Response } from 'express';

import { domain } from '../../../utils';

export async function getSearch(req: Request, res: Response): Promise<void> {
	// @ts-ignore
	const [command, url] = req.query.q.split(' ');

	if (command === '!add') {
		res.redirect(`${domain}/dashboard/bookmarks?add=${url}`);
		return;
	}

	if (command === '!g') {
		res.redirect(`https://www.google.com/search?q=${url}`);
		return;
	}

	if (command === '!b') {
		res.redirect(`/dashboard`);
		return;
	}

	if (command === '!bm') {
		res.redirect(`/dashboard/bookmarks`);
		return;
	}

	res.status(200).json({
		message: 'ok',
		query: req.query,
	});
}
