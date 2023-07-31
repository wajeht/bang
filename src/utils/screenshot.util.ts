/* eslint-disable @typescript-eslint/no-explicit-any */
import puppeteer from 'puppeteer';
import crypto from 'crypto';
import path from 'path';
import sharp from 'sharp';

let cachedBrowser: any;

async function getBrowser() {
	if (!cachedBrowser) {
		cachedBrowser = await puppeteer.launch({
			headless: true,
			executablePath: '/usr/bin/chromium-browser',
			args: ['--no-sandbox', '--disable-gpu'],
		});
	}
	return cachedBrowser;
}

export default async function screenshot(url: string): Promise<string> {
	const FILE_NAME = crypto.randomBytes(8).toString('hex') + '.png';
	const PATH = path.resolve(path.join(process.cwd(), 'public', 'assets', FILE_NAME));

	const browser = await getBrowser();
	const page = await browser.newPage();
	await page.goto(url);
	const screenshotBuffer = await page.screenshot();
	await page.close();

	await sharp(screenshotBuffer).resize(800).jpeg({ quality: 80 }).toFile(PATH);

	return PATH;
}
