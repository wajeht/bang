/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Request, Response } from 'express';
import { domain } from '../../../utils';
import axios from 'axios';

const DOMAIN = domain();

export async function getSearch(req: Request, res: Response): Promise<void> {
	// @ts-ignore
	const [command, url] = req.query.q.split(' ');

	if (command === '!add') {
		res.redirect(`${DOMAIN}/dashboard/bookmarks?add=${url}`);
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

export async function getUrlTitle(req: Request, res: Response): Promise<void> {
	const { url } = req.query;

	// add no cors to the url
	const response = await axios.get(url, {
		headers: {
			'Access-Control-Allow-Origin': '*',
		},
	});

	// get the text from the response
	const text = await response.data;

	// get the title from the text
	const title = text.match(/<title[^>]*>([^<]+)<\/title>/)[1];

	res.status(200).json({
		message: 'ok',
		title,
	});
}
