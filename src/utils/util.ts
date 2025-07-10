import type {
    Api,
    User,
    PageType,
    ApiKeyPayload,
    BookmarkToExport,
    MagicLinkPayload,
    PaginateArrayOptions,
    TurnstileVerifyResponse,
} from '../type';
import http from 'node:http';
import path from 'node:path';
import { db } from '../db/db';
import https from 'node:https';
import jwt from 'jsonwebtoken';
import { logger } from './logger';
import fs from 'node:fs/promises';
import { config } from '../config';
import nodemailer from 'nodemailer';
import { bookmarks } from '../db/db';
import type { Request } from 'express';
import type { Bookmark } from '../type';
import type { Attachment } from 'nodemailer/lib/mailer';
import { HttpError, NotFoundError, ValidationError } from '../error';

export const actionTypes = ['search', 'redirect'] as const;

export const defaultSearchProviders = {
    duckduckgo: `https://duckduckgo.com/?q={{{s}}}`,
    google: `https://www.google.com/search?q={{{s}}}`,
    yahoo: `https://search.yahoo.com/search?p={{{s}}}`,
    bing: `https://www.bing.com/search?q={{{s}}}`,
} as const;

export async function updateUserBangLastReadAt({
    userId,
    bangId,
}: {
    userId: number;
    bangId: number;
}): Promise<void> {
    try {
        await db('bangs')
            .where({ user_id: userId, id: bangId })
            .update({
                last_read_at: db.fn.now(),
                usage_count: db.raw('usage_count + 1'),
            });
    } catch (error) {
        logger.error(`[updateUserBangLastReadAt]: error updating bang last read at, %o`, { error });
    }
}

export async function checkDuplicateBookmarkUrl(
    userId: number,
    url: string,
): Promise<Bookmark | null> {
    try {
        return await db('bookmarks').where({ user_id: userId, url }).first();
    } catch (error) {
        logger.error(`[checkDuplicateBookmarkUrl]: error checking duplicate URL, %o`, { error });
        return null;
    }
}

export async function insertBookmark({
    url,
    userId,
    title,
    pinned,
    req,
}: {
    url: string;
    userId: number;
    title?: string;
    pinned?: boolean;
    req?: Request;
}): Promise<void> {
    try {
        const bookmark = await bookmarks.create({
            user_id: userId,
            url: url,
            title: title || 'Fetching title...',
            pinned: pinned || false,
        });

        if (!title) {
            setTimeout(() => insertPageTitle({ bookmarkId: bookmark.id, url, req }), 0);
        }
    } catch (error) {
        logger.error(`[insertBookmark]: error inserting bookmark, %o`, { error });
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
}): Promise<void> {
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
    _escapeHtml: function (text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    },
    _createHTML: function (bookmark: BookmarkToExport): string {
        const escapedUrl = this._escapeHtml(bookmark.url);
        const escapedTitle = this._escapeHtml(bookmark.title);
        return `<DT><A HREF="${escapedUrl}" ADD_DATE="${bookmark.add_date}">${escapedTitle}</A>`;
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

export function isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
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
        try {
            return await db
                .select('*')
                .from('users')
                .where({ id: req.apiKeyPayload.userId })
                .first();
        } catch (error) {
            logger.error(`Failed to extract user: %o`, { error });
            throw new HttpError(500, 'Failed to extract user!', req);
        }
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
        defaultPerPage = user.column_preferences.users.default_per_page;
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

export async function isMailpitRunning(): Promise<boolean> {
    try {
        const url = process.env.DOCKER_CONTAINER
            ? 'http://mailpit:8025/'
            : 'http://localhost:8025/';
        const response = await fetch(url, {
            signal: AbortSignal.timeout(1500),
        });
        return response.ok;
    } catch {
        return false;
    }
}

export async function getReadmeFileContent(): Promise<string> {
    try {
        const readmeFilepath = path.resolve(path.join(process.cwd(), 'README.md'));
        return await fs.readFile(readmeFilepath, { encoding: 'utf8' });
    } catch (error: unknown) {
        logger.error(`Failed to get readme file content: %o`, { error });
        return '';
    }
}

export function extractReadmeUsage(readmeFileContent: string): string {
    if (!readmeFileContent) return '';

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
    try {
        if (!cachedReadMeMdHTML) {
            const content = await getReadmeFileContent();
            const usage = extractReadmeUsage(content);
            const { marked } = await import('marked');
            cachedReadMeMdHTML = Promise.resolve(marked(usage));
        }
        return cachedReadMeMdHTML;
    } catch (error) {
        logger.error(`Failed to get converted readme md to html: %o`, { error });
        return '';
    }
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
}): Promise<void> {
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
        if (config.app.env === 'development' && (await isMailpitRunning()) === false) {
            logger.info(`We are on dev mode and mailpit is not running, magic link: ${magicLink}`);
        }
        await emailTransporter.sendMail(mailOptions);
        logger.info(`Magic link sent to ${email}`);
    } catch (error) {
        logger.error(`Failed to send magic link email: %o`, { error });
    }
}

export async function convertMarkdownToPlainText(
    markdownInput: string,
    maxLength?: number,
): Promise<string> {
    if (!markdownInput?.trim()) {
        return '';
    }

    try {
        const { marked } = await import('marked');
        const htmlOutput = await marked(markdownInput);
        let plainText = (htmlOutput as string).replace(/<[^>]*>/g, '');
        plainText = plainText.replace(/\s+/g, ' ').trim();

        if (maxLength && plainText.length > maxLength) {
            plainText = plainText.slice(0, maxLength).trim() + '...';
        }

        return plainText;
    } catch (error) {
        logger.error(`Failed to convert markdown to plain text: %o`, { error });
        return '';
    }
}

export async function generateUserDataExport(
    userId: number,
    options: {
        includeBookmarks?: boolean;
        includeActions?: boolean;
        includeNotes?: boolean;
        includeUserPreferences?: boolean;
        includeTabs?: boolean;
    } = {},
): Promise<{
    exported_at: string;
    version: string;
    bookmarks?: Record<string, unknown>[];
    actions?: Record<string, unknown>[];
    notes?: Record<string, unknown>[];
    user_preferences?: Record<string, unknown>;
}> {
    const {
        includeBookmarks = true,
        includeActions = true,
        includeNotes = true,
        includeUserPreferences = true,
        includeTabs = true,
    } = options;

    const exportData: {
        exported_at: string;
        version: string;
        bookmarks?: Record<string, unknown>[];
        actions?: Record<string, unknown>[];
        notes?: Record<string, unknown>[];
        tabs?: Record<string, unknown>[];
        user_preferences?: Record<string, unknown>;
    } = {
        exported_at: new Date().toISOString(),
        version: '1.0',
    };

    const fetchBookmarks = () =>
        includeBookmarks
            ? db('bookmarks')
                  .where('user_id', userId)
                  .select('title', 'url', 'pinned', 'created_at')
            : Promise.resolve([]);

    const fetchActions = () =>
        includeActions
            ? db
                  .select(
                      'bangs.trigger',
                      'bangs.name',
                      'bangs.url',
                      'action_types.name as action_type',
                      'bangs.created_at',
                  )
                  .from('bangs')
                  .join('action_types', 'bangs.action_type_id', 'action_types.id')
                  .where('bangs.user_id', userId)
            : Promise.resolve([]);

    const fetchNotes = () =>
        includeNotes
            ? db('notes')
                  .where('user_id', userId)
                  .select('title', 'content', 'pinned', 'created_at')
            : Promise.resolve([]);

    const fetchTabs = () =>
        includeTabs
            ? db('tabs').where('user_id', userId).select('title', 'url', 'created_at')
            : Promise.resolve([]);

    const fetchUserPreferences = () =>
        includeUserPreferences
            ? db('users')
                  .where('id', userId)
                  .select(
                      'username',
                      'default_search_provider',
                      'autocomplete_search_on_homepage',
                      'column_preferences',
                  )
                  .first()
            : Promise.resolve(null);

    const [bookmarksResult, actionsResult, notesResult, userPreferencesResult, tabsResult] =
        await Promise.allSettled([
            fetchBookmarks(),
            fetchActions(),
            fetchNotes(),
            fetchUserPreferences(),
            fetchTabs(),
        ]);

    if (includeBookmarks) {
        if (bookmarksResult.status === 'fulfilled') {
            exportData.bookmarks = bookmarksResult.value;
        } else {
            logger.error('Failed to fetch bookmarks: %o', bookmarksResult.reason);
        }
    }

    if (includeActions) {
        if (actionsResult.status === 'fulfilled') {
            exportData.actions = actionsResult.value;
        } else {
            logger.error('Failed to fetch actions: %o', actionsResult.reason);
        }
    }

    if (includeNotes) {
        if (notesResult.status === 'fulfilled') {
            exportData.notes = notesResult.value;
        } else {
            logger.error('Failed to fetch notes: %o', notesResult.reason);
        }
    }

    if (includeUserPreferences) {
        if (userPreferencesResult.status === 'fulfilled' && userPreferencesResult.value) {
            const userPrefs = userPreferencesResult.value;
            // Parse column_preferences if it's a string
            if (typeof userPrefs.column_preferences === 'string') {
                try {
                    userPrefs.column_preferences = JSON.parse(userPrefs.column_preferences);
                } catch (error) {
                    logger.error('Failed to parse column_preferences: %o', error);
                    userPrefs.column_preferences = {};
                }
            }
            exportData.user_preferences = userPrefs;
        } else if (userPreferencesResult.status === 'rejected') {
            logger.error('Failed to fetch user preferences: %o', userPreferencesResult.reason);
        }
    }

    if (includeTabs) {
        if (tabsResult.status === 'fulfilled') {
            exportData.tabs = tabsResult.value;
        } else {
            logger.error('Failed to fetch tabs: %o', tabsResult.reason);
        }
    }

    return exportData;
}

export async function generateBookmarkHtmlExport(userId: number): Promise<string> {
    const bookmarks = (await db
        .select('url', 'title', db.raw("strftime('%s', created_at) as add_date"))
        .from('bookmarks')
        .where({ user_id: userId })) as BookmarkToExport[];

    return bookmark.createDocument(bookmarks);
}

export async function sendDataExportEmail({
    email,
    username,
    req,
    includeJson = true,
    includeHtml = true,
}: {
    email: string;
    username: string;
    req: Request;
    includeJson?: boolean;
    includeHtml?: boolean;
}): Promise<void> {
    try {
        if (!includeJson && !includeHtml) {
            logger.info(`No export options selected for ${email}, skipping export email`);
            return;
        }

        const userId = (req.user as User).id;
        const currentDate = new Date().toISOString().split('T')[0];
        const attachments: Attachment[] = [];
        const exportTypes: string[] = [];

        if (includeJson) {
            const jsonExportData = await generateUserDataExport(userId);
            const jsonBuffer = Buffer.from(JSON.stringify(jsonExportData, null, 2));
            attachments.push({
                filename: `bang-data-export-${currentDate}.json`,
                content: jsonBuffer,
                contentType: 'application/json',
            });
            exportTypes.push(
                'bang-data-export-' +
                    currentDate +
                    '.json - Complete data export including bookmarks, actions, notes, and user preferences',
            );
        }

        if (includeHtml) {
            const htmlBookmarksExport = await generateBookmarkHtmlExport(userId);
            const htmlBuffer = Buffer.from(htmlBookmarksExport);
            attachments.push({
                filename: `bookmarks-${currentDate}.html`,
                content: htmlBuffer,
                contentType: 'text/html',
            });
            exportTypes.push(
                'bookmarks-' +
                    currentDate +
                    '.html - HTML bookmarks file that can be imported into browsers',
            );
        }

        const attachmentsList = exportTypes
            .map((type, index) => `${index + 1}. ${type}`)
            .join('\n');

        const mailOptions = {
            from: config.email.from,
            to: email,
            subject: '📦 Your Bang Data Export - Account Deletion',
            text: `Hello ${username},

As requested, we have prepared your data export from Bang before proceeding with your account deletion.

Attached to this email you will find:
${attachmentsList}

Your account will be deleted shortly. This action cannot be undone.

If you change your mind about deleting your account, please contact us immediately.

Thank you for using Bang!

--
Bang Team
https://github.com/wajeht/bang`,
            attachments,
        };

        if (config.app.env === 'development' && (await isMailpitRunning()) === false) {
            logger.info(
                `We are on dev mode and mailpit is not running. Data export email would be sent to ${email} with ${attachments.length} attachment(s).`,
            );
            return;
        }

        await emailTransporter.sendMail(mailOptions);
        logger.info(
            `Data export email sent to ${email} before account deletion with ${attachments.length} attachment(s)`,
        );
    } catch (error) {
        logger.error(`Failed to send data export email: %o`, { error });
    }
}

export async function verifyTurnstileToken(
    token: string,
    remoteip?: string,
): Promise<TurnstileVerifyResponse> {
    const formData = new URLSearchParams();
    formData.append('secret', config.cloudflare.turnstileSecretKey);
    formData.append('response', token);
    if (remoteip) {
        formData.append('remoteip', remoteip);
    }

    try {
        const result = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
            method: 'POST',
            body: formData,
        });

        const outcome = (await result.json()) as TurnstileVerifyResponse;

        if (!outcome.success) {
            const errors = outcome['error-codes']?.join(', ') || 'Unknown error';
            throw new Error(`Turnstile validation failed: ${errors}`);
        }

        return outcome;
    } catch (error) {
        throw new Error(`Failed to verify Turnstile token: ${(error as Error).message}`);
    }
}

export function paginate<T>(array: T[], options: PaginateArrayOptions) {
    const { page, perPage, total } = options;
    const currentPage = Math.max(1, page);
    const offset = (currentPage - 1) * perPage;
    const data = array.slice(offset, offset + perPage);
    const lastPage = Math.ceil(total / perPage);

    return {
        data,
        total,
        perPage,
        currentPage,
        lastPage,
        from: offset + 1,
        to: offset + data.length,
        hasNext: currentPage < lastPage,
        hasPrev: currentPage > 1,
    };
}

export async function addToTabs(
    /** The ID of the user to add the bookmark or bang to */
    userId: number,
    /** The ID of the tab to add the bookmark or bang to */
    tab_id: number,
    /** The type of the tab to add, either 'bookmarks' or 'bangs' */
    type: 'bookmarks' | 'bangs',
    /** The ID of the bookmark or bang to add */
    id: number,
): Promise<void | ValidationError | NotFoundError> {
    if (!['bookmarks', 'bangs'].includes(type)) {
        throw new ValidationError({ type: 'Invalid type, must be either "bookmarks" or "bangs"' });
    }

    if (!id) {
        throw new ValidationError({ id: 'Invalid id, must be a valid number' });
    }

    const tab = await db('tabs').where({ id: tab_id, user_id: userId }).first();

    if (!tab) {
        throw new ValidationError({ tab_id: `Tab with ID ${tab_id} not found for user ${userId}` });
    }

    const item = await db(type).where({ id, user_id: userId }).first();

    if (!item) {
        throw new NotFoundError(`${type} not found`);
    }

    switch (type) {
        case 'bookmarks':
            await db('tab_items').insert({
                tab_id,
                title: item.title,
                url: item.url,
            });
            break;
        case 'bangs':
            await db('tab_items').insert({
                tab_id,
                title: item.name,
                url: item.url,
            });
            break;
        default:
            throw new ValidationError({
                type: 'Invalid type, must be either "bookmarks" or "bangs"',
            });
    }
}
