import { db } from './db/db';
import http from 'node:http';
import path from 'node:path';
import https from 'node:https';
import jwt from 'jsonwebtoken';
import { marked } from 'marked';
import { logger } from './logger';
import { config } from './config';
import fs from 'node:fs/promises';
import { Request } from 'express';
import nodemailer from 'nodemailer';
import { HttpError } from './error';
import { bookmarks } from './repository';
import { Api, User, PageType, ApiKeyPayload, BookmarkToExport, MagicLinkPayload } from './type';

export async function updateUserBangLastReadAt({
    userId,
    bangId,
}: {
    userId: number;
    bangId: number;
}) {
    await db('bangs').where({ user_id: userId, id: bangId }).update({ last_read_at: db.fn.now() });
}

export async function insertBookmark({
    url,
    userId,
    title,
    req,
}: {
    url: string;
    userId: number;
    title?: string;
    req?: Request;
}) {
    const bookmark = await bookmarks.create({
        user_id: userId,
        url: url,
        title: title || 'Fetching title...',
    });

    if (!title) {
        setTimeout(() => insertPageTitle({ bookmarkId: bookmark.id, url, req }), 0);
    }
}

export async function insertPageTitle({
    bookmarkId,
    actionId,
    url,
    req,
}: {
    bookmarkId?: number;
    actionId?: number;
    url: string;
    req?: Request;
}) {
    if ((bookmarkId && actionId) || (!bookmarkId && !actionId)) {
        throw new HttpError(
            500,
            'You must pass in exactly one id: either bookmarkId or actionId',
            req,
        );
    }

    const title = await fetchPageTitle(url);

    if (bookmarkId) {
        try {
            await db('bookmarks')
                .where({ id: bookmarkId })
                .update({ title, updated_at: db.fn.now() });
        } catch (error) {
            logger.error(`[insertPageTitle]: error updating bookmark title, %o`, { error });
        }
    }

    if (actionId) {
        try {
            await db('bangs')
                .where({ id: actionId })
                .update({ name: title, updated_at: db.fn.now() });
        } catch (error) {
            logger.error(`[insertPageTitle]: error updating bangs name, %o`, { error });
        }
    }
}

export async function fetchPageTitle(url: string): Promise<string> {
    try {
        new URL(url);
    } catch {
        return 'Untitled';
    }

    const client = url.startsWith('https') ? https : http;

    return new Promise<string>((resolve) => {
        const req = client.get(
            url,
            {
                timeout: 5000, // 5 sec
                headers: {
                    Accept: 'text/html',
                    'User-Agent':
                        'Mozilla/5.0 (compatible; Bang/1.0; +https://github.com/wajeht/bang)',
                },
            },
            (res) => {
                if (res.statusCode !== 200) {
                    req.destroy();
                    return resolve('Untitled');
                }

                let isTitleFound = false;
                const titleRegex = /<title[^>]*>([^<]+)/i;

                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    if (!isTitleFound) {
                        const match = titleRegex.exec(chunk);
                        if (match && match[1]) {
                            isTitleFound = true;
                            resolve(match[1].slice(0, 100).trim());
                            req.destroy();
                        }
                    }
                });

                res.on('end', () => {
                    if (!isTitleFound) resolve('Untitled');
                });
            },
        );

        req.on('error', () => resolve('Untitled'));
        req.end();
    });
}

export const bookmark = {
    _createHTML: function (bookmark: BookmarkToExport): string {
        return `<DT><A HREF="${bookmark.url}" ADD_DATE="${bookmark.add_date}">${bookmark.title}</A>`;
    },
    createDocument: function (bookmarks: BookmarkToExport[]): string {
        const header = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>`;

        const footer = '</DL><p>';

        const bookmarksHTML = bookmarks.map((bookmark) => this._createHTML(bookmark)).join('\n');

        return `${header}\n${bookmarksHTML}\n${footer}`;
    },
};

export function isValidUrl(url: string): boolean {
    try {
        new URL(url);
        return true;
    } catch (error) {
        logger.error(`[isValidUrl]: Not a valid url, %o`, { error });
        return false;
    }
}

export function addHttps(url: string): string {
    url = url.trim();

    if (url.length === 0) {
        throw new Error('Invalid input: URL cannot be empty');
    }

    if (url.toLowerCase().startsWith('https://')) {
        return url;
    }

    if (url.toLowerCase().startsWith('http://')) {
        url = url.substring(7);
    }

    url = url.replace(/^\/+/, '');

    return `https://${url}`;
}

export async function sendNotification({
    req,
    error,
}: {
    req: Request;
    error: Error;
}): Promise<void> {
    try {
        const n = await fetch(config.notify.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': config.notify.apiKey,
            },
            body: JSON.stringify({
                message: `Error: ${error?.message}`,
                details: JSON.stringify(
                    {
                        request: {
                            method: req.method,
                            url: req.url,
                            headers: req.headers,
                            query: req.query,
                            body: req.body,
                        },
                        error: {
                            name: error?.name,
                            message: error?.message,
                            stack: error?.stack,
                            cause: error?.cause,
                        },
                        user: req.session?.user ?? req?.user,
                    },
                    null,
                    2,
                ),
            }),
        });

        if (!n.ok) {
            const text = await n.text();
            logger.error(
                `[sendNotification]: Notification service responded with status ${n.status}: ${text}`,
            );
        }
    } catch (error) {
        logger.error(`[sendNotification]: failed to send error notification: %o`, { error });
    }
}

export const api: Api = {
    generate: async function (payload: ApiKeyPayload): Promise<string> {
        return jwt.sign(payload, config.app.apiKeySecret);
    },
    verify: async function (apiKey: string): Promise<ApiKeyPayload | null> {
        try {
            const decodedApiKeyPayload = jwt.verify(
                apiKey,
                config.app.apiKeySecret,
            ) as ApiKeyPayload;

            const app = await db('users')
                .where({
                    id: decodedApiKeyPayload.userId,
                    api_key: apiKey,
                    api_key_version: decodedApiKeyPayload.apiKeyVersion,
                })
                .first();

            if (!app) return null;

            return decodedApiKeyPayload;
        } catch (error) {
            logger.error(`[Api#verify]: failed to verify api key: %o`, { error });
            return null;
        }
    },
};

export const magicLink = {
    generate: function (payload: MagicLinkPayload): string {
        return jwt.sign(payload, config.app.secretSalt, { expiresIn: '15m' });
    },
    verify: function (token: string): MagicLinkPayload | null {
        try {
            return jwt.verify(token, config.app.secretSalt) as MagicLinkPayload;
        } catch (error) {
            logger.error(`[MagicLink#verify]: failed to verify magic link token: %o`, { error });
            return null;
        }
    },
};

export function getApiKey(req: Request): string | undefined {
    const apiKey = req.header('X-API-KEY');
    const authHeader = req.header('Authorization');

    if (authHeader?.startsWith('Bearer ')) {
        return authHeader.substring(7);
    }

    return apiKey;
}

export function isApiRequest(req: Request): boolean {
    return !!getApiKey(req) || req.path.startsWith('/api/') || expectJson(req);
}

export function expectJson(req: Request): boolean {
    return req.header('Content-Type') === 'application/json';
}

export async function extractUser(req: Request): Promise<User> {
    if (isApiRequest(req) && req.apiKeyPayload) {
        return db.select('*').from('users').where({ id: req.apiKeyPayload.userId }).first();
    }

    if (req.session?.user) {
        return req.session.user;
    }

    throw new HttpError(500, 'User not found from request!', req);
}

export function extractPagination(req: Request, pageType: PageType | 'admin') {
    const user = req.user as User;
    let defaultPerPage = 10;

    if (pageType === 'actions') {
        defaultPerPage = user.column_preferences.actions.default_per_page;
    }

    if (pageType === 'bookmarks') {
        defaultPerPage = user.column_preferences.bookmarks.default_per_page;
    }

    if (pageType === 'notes') {
        defaultPerPage = user.column_preferences.notes.default_per_page;
    }

    if (pageType === 'admin') {
        defaultPerPage = 10;
    }

    return {
        perPage: parseInt(req.query.per_page as string, 10) || defaultPerPage || 10,
        page: parseInt(req.query.page as string, 10) || 1,
        search: ((req.query.search as string) || '').toLowerCase(),
        sortKey: (req.query.sort_key as string) || 'created_at',
        direction: (req.query.direction as string) || 'desc',
    };
}

export function highlightSearchTerm(
    text: string | null | undefined,
    searchTerm: string | null | undefined,
) {
    if (!searchTerm || !text) return text;

    const original = String(text || '');

    if (!searchTerm.trim()) return original;

    const searchWords = searchTerm
        .trim()
        .split(/\s+/)
        .filter((word) => word.length > 0);

    if (searchWords.length === 0) return original;

    let result = original
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');

    const searchRegex = new RegExp(searchWords.map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi'); // prettier-ignore

    result = result.replace(searchRegex, (match) => `<mark>${match}</mark>`); // prettier-ignore

    return result;
}

export function nl2br(str: string): string {
    if (str === null || str === undefined || str === '') {
        return '';
    }

    const safeStr = String(str);

    return safeStr.replace(/(?:\r\n|\r|\n|\t| )/g, (match: string) => {
        switch (match) {
            case '\r\n':
            case '\r':
            case '\n':
                return '<br>';
            case '\t':
                return '&nbsp;&nbsp;&nbsp;&nbsp;'; // 4 spaces for a tab
            case ' ':
                return '&nbsp;'; // Non-breaking space
            default:
                return match; // Handle any other characters matched
        }
    });
}

export function isOnlyLettersAndNumbers(str: string): boolean {
    return /^[a-zA-Z0-9]+$/.test(str);
}

export function checkMailpit(): Promise<boolean> {
    return new Promise((resolve) => {
        const req = http.get('http://localhost:8025', () => {
            resolve(true);
        });
        req.on('error', () => resolve(false));
        req.setTimeout(1000, () => {
            req.destroy();
            resolve(false);
        });
    });
}

export async function getReadmeFileContent(): Promise<string> {
    try {
        const readmeFilepath = path.resolve(path.join(process.cwd(), 'README.md'));
        return await fs.readFile(readmeFilepath, { encoding: 'utf8' });
    } catch (_error: any) {
        return '';
    }
}

export function extractReadmeUsage(readmeFileContent: string): string {
    const start = '<!-- starts -->';
    const end = '<!-- ends -->';

    const startIndex = readmeFileContent.indexOf(start);
    const endIndex = readmeFileContent.indexOf(end);

    if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
        return '';
    }

    return readmeFileContent.slice(startIndex + start.length, endIndex).trim();
}

let cachedReadMeMdHTML: Promise<string> | undefined;
export async function getConvertedReadmeMDToHTML(): Promise<string> {
    if (!cachedReadMeMdHTML) {
        const content = await getReadmeFileContent();
        const usage = extractReadmeUsage(content);
        cachedReadMeMdHTML = Promise.resolve(marked(usage));
    }
    return cachedReadMeMdHTML;
}

const emailTransporter = nodemailer.createTransport({
    host: config.email.host,
    port: config.email.port,
    secure: config.email.secure,
    auth:
        config.email.user && config.email.password
            ? {
                  user: config.email.user,
                  pass: config.email.password,
              }
            : undefined,
});

export async function sendMagicLinkEmail({
    email,
    token,
    req,
}: {
    email: string;
    token: string;
    req: Request;
}) {
    const magicLink = `${req.protocol}://${req.get('host')}/auth/magic/${token}`;

    const mailOptions = {
        from: config.email.from,
        to: email,
        subject: '🔗 Your Bang Magic Link',
        text: `Your Bang Magic Link

Click this link to log in:
${magicLink}

This link will expire in 15 minutes. If you didn't request this, you can safely ignore this email.

--
Bang Team
https://github.com/wajeht/bang`,
    };

    try {
        await emailTransporter.sendMail(mailOptions);
        logger.info(`Magic link sent to ${email}`);
    } catch (error) {
        logger.error(`Failed to send magic link email: %o`, { error });
    }
}

export async function convertMarkdownToPlainText(markdownInput: string) {
    const htmlOutput = await marked(markdownInput);
    let plainText = htmlOutput.replace(/<[^>]*>/g, '');

    plainText = plainText.replace(/\n\s*\n/g, '\n');
    plainText = plainText.trim();

    return plainText;
}
