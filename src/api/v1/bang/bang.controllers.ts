/* eslint-disable @typescript-eslint/ban-ts-comment */
import { Request, Response } from 'express';
import { DOMAIN } from '../../../utils';
import axios from 'axios';
import { URL } from 'url';

import type { getUrlInfoSchemaType } from './bang.validations';

export async function getSearch(req: Request, res: Response): Promise<void> {
	// @ts-ignore
	const [command, ...url] = req.query.q.split(' ');

	if (command === '!add') {
		res.redirect(`${DOMAIN}/dashboard/bookmarks?url=${url}`);
		return;
	}

	if (command === '!g') {
		res.redirect(`https://www.google.com/search?q=${url.join(' ')}`);
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

export async function getUrlInfo(req: Request<unknown, unknown, unknown, getUrlInfoSchemaType>, res: Response): Promise<void> {
	const { url } = req.query;
	const response = await axios.get(url);
	const text = await response.data;

	const title = extractValue(text, /<title[^>]*>([^<]+)<\/title>/);
	const description = extractValue(
		text,
		/<meta[^>]*name="description"[^>]*content="([^"]*)"[^>]*>/,
	);

	console.log('title', title);
	console.log('description', description);

	let favicon_url =
		extractValue(text, /<link[^>]*rel="shortcut icon"[^>]*href="([^"]*)"[^>]*>/) ||
		extractValue(text, /<link[^>]*rel="icon"[^>]*href="([^"]*)"[^>]*>/) ||
		extractValue(text, /<link[^>]*rel="apple-touch-icon"[^>]*href="([^"]*)"[^>]*>/) ||
		extractValue(text, /<link[^>]*rel="apple-touch-icon-precomposed"[^>]*href="([^"]*)"[^>]*>/) ||
		extractValue(text, /<link[^>]*rel="mask-icon"[^>]*href="([^"]*)"[^>]*>/) ||
		extractValue(text, /<link[^>]*rel="fluid-icon"[^>]*href="([^"]*)"[^>]*>/) ||
		extractValue(text, /<link[^>]*rel="icon"[^>]*href="([^"]*)"[^>]*>/);

	// Convert relative favicon URL to absolute if necessary
	if (favicon_url && !favicon_url.startsWith('http')) {
		const base = new URL(url);
		favicon_url = new URL(favicon_url, base).toString();
	}

	res.status(200).json({
		message: 'ok',
		data: [
			{
				url,
				title,
				description,
				favicon_url,
			},
		],
	});
}

function extractValue(text: string, regex: RegExp): string | null {
	const match = text.match(regex);
	return match ? match[1] : null;
}
