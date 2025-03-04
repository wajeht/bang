import {
    Api,
    User,
    PageType,
    ApiKeyPayload,
    GithubUserEmail,
    BookmarkToExport,
    GitHubOauthToken,
} from './type';
import qs from 'qs';
import fastq from 'fastq';
import { db } from './db/db';
import http from 'node:http';
import https from 'node:https';
import jwt from 'jsonwebtoken';
import { Request } from 'express';
import { logger } from './logger';
import { HttpError } from './error';
import { bookmarks } from './repository';
import { appConfig, notifyConfig, oauthConfig } from './config';

export const insertBookmarkQueue = fastq.promise(insertBookmark, 10);
export const insertPageTitleQueue = fastq.promise(insertPageTitle, 10);
export const sendNotificationQueue = fastq.promise(sendNotification, 10);

export const github = {
    getOauthToken: async function (code: string): Promise<GitHubOauthToken> {
        const rootUrl = 'https://github.com/login/oauth/access_token';

        const options = {
            client_id: oauthConfig.github.client_id,
            client_secret: oauthConfig.github.client_secret,
            code,
        };

        const queryString = qs.stringify(options);

        const response = await fetch(`${rootUrl}?${queryString}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        });

        if (!response.ok) {
            logger.error('[getUserEmails]: Failed to fetch GitHub OAuth tokens');
            throw new HttpError(500, 'Failed to fetch GitHub OAuth tokens');
        }

        const data = await response.text();
        return qs.parse(data) as GitHubOauthToken;
    },

    getUserEmails: async function (access_token: string): Promise<GithubUserEmail[]> {
        const response = await fetch('https://api.github.com/user/emails', {
            headers: {
                Authorization: `Bearer ${access_token}`,
            },
        });

        if (!response.ok) {
            logger.error('[getUserEmails]: Failed to fetch GitHub user emails');
            throw new HttpError(500, 'Failed to fetch GitHub user emails');
        }

        return (await response.json()) as GithubUserEmail[];
    },
};

export async function insertBookmark({
    url,
    userId,
    title,
}: {
    url: string;
    userId: number;
    title?: string;
}) {
    const bookmark = await bookmarks.create({
        user_id: userId,
        url: url,
        title: title || 'Fetching title...',
    });

    if (!title) {
        void insertPageTitleQueue.push({ bookmarkId: bookmark.id, url });
    }
}

export async function insertPageTitle({
    bookmarkId,
    actionId,
    url,
}: {
    bookmarkId?: number;
    actionId?: number;
    url: string;
}) {
    if ((bookmarkId && actionId) || (!bookmarkId && !actionId)) {
        throw new HttpError(500, 'You must pass in exactly one id: either bookmarkId or actionId');
    }

    const title = await fetchPageTitle(url);

    if (bookmarkId) {
        try {
            await db('bookmarks')
                .where({ id: bookmarkId })
                .update({ title, updated_at: db.fn.now() });
        } catch (error) {
            logger.error(`[insertPageTitle]: error updating bookmark title, %o`, error);
        }
    }

    if (actionId) {
        try {
            await db('bangs')
                .where({ id: actionId })
                .update({ name: title, updated_at: db.fn.now() });
        } catch (error) {
            logger.error(`[insertPageTitle]: error updating bangs name, %o`, error);
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
                headers: { Accept: 'text/html' },
            },
            (res) => {
                if (res.statusCode !== 200) {
                    req.destroy();
                    return resolve('Untitled');
                }

                let isTitleFound = false;

                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    if (!isTitleFound) {
                        const match = /<title[^>]*>([^<]+)/i.exec(chunk);
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
        logger.error(`[isValidUrl]: Not a valid url, %o`, error);
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
        const n = await fetch(notifyConfig.url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-KEY': notifyConfig.apiKey,
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
        logger.error(`[sendNotification]: failed to send error notification: %o`, error);
    }
}

export const api: Api = {
    generate: async function (payload: ApiKeyPayload): Promise<string> {
        return jwt.sign(payload, appConfig.apiKeySecret);
    },
    verify: async function (apiKey: string): Promise<ApiKeyPayload | null> {
        try {
            const decodedApiKeyPayload = jwt.verify(
                apiKey,
                appConfig.apiKeySecret,
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
            logger.error(`[Api#verify]: failed to verify api key: %o`, error);
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
    return !!getApiKey(req) || req.path.startsWith('/api') || expectJson(req);
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

    throw new HttpError(500, 'User not found from request!');
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
