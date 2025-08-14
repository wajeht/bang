import {
    api,
    nl2br,
    bookmark,
    addHttps,
    getApiKey,
    isValidUrl,
    isUrlLike,
    expectJson,
    extractUser,
    isApiRequest,
    fetchPageTitle,
    insertBookmark,
    extractPagination,
    extractReadmeUsage,
    highlightSearchTerm,
    getReadmeFileContent,
    formatDateInTimezone,
    processReminderDigests,
    isOnlyLettersAndNumbers,
    getConvertedReadmeMDToHTML,
} from './util';
import path from 'node:path';
import { db } from '../db/db';
import dayjs from '../utils/dayjs';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import { Request } from 'express';
import { config } from '../config';
import { ApiKeyPayload, BookmarkToExport } from '../type';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

describe.concurrent('isValidUrl', () => {
    it('should return true for valid URLs', () => {
        expect(isValidUrl('https://example.com')).toBeTruthy();
        expect(isValidUrl('http://example.com')).toBeTruthy();
        expect(isValidUrl('ftp://example.com')).toBeTruthy();
        expect(isValidUrl('https://example.com/path?query=param')).toBeTruthy();
    });

    it('should return false for invalid URLs', () => {
        expect(isValidUrl('not-a-url')).toBeFalsy();
        expect(isValidUrl('')).toBeFalsy();
        expect(isValidUrl('example')).toBeFalsy();
    });

    it('should return false for non-string inputs', () => {
        // @ts-ignore to simulate incorrect input
        expect(isValidUrl(null)).toBeFalsy();
        // @ts-ignore to simulate incorrect input
        expect(isValidUrl(undefined)).toBeFalsy();
        // @ts-ignore to simulate incorrect input
        expect(isValidUrl(123)).toBeFalsy();
    });
});

describe.concurrent('isUrlLike', () => {
    it('should return true for valid full URLs', () => {
        expect(isUrlLike('https://example.com')).toBeTruthy();
        expect(isUrlLike('http://example.com')).toBeTruthy();
        expect(isUrlLike('HTTP://EXAMPLE.COM')).toBeTruthy();
        expect(isUrlLike('HTTPS://EXAMPLE.COM')).toBeTruthy();
        expect(isUrlLike('https://sub.example.com')).toBeTruthy();
        expect(isUrlLike('https://example.com/path?query=param')).toBeTruthy();
    });

    it('should return true for domain-like patterns', () => {
        expect(isUrlLike('google.com')).toBeTruthy();
        expect(isUrlLike('google.coM')).toBeTruthy();
        expect(isUrlLike('example.org')).toBeTruthy();
        expect(isUrlLike('sub.domain.co.uk')).toBeTruthy();
        expect(isUrlLike('github.io')).toBeTruthy();
    });

    it('should return true for www patterns', () => {
        expect(isUrlLike('www.google.com')).toBeTruthy();
        expect(isUrlLike('www.Google.COM')).toBeTruthy();
        expect(isUrlLike('WWW.example.org')).toBeTruthy();
    });

    it('should return false for invalid domain patterns', () => {
        expect(isUrlLike('not-a-url')).toBeFalsy();
        expect(isUrlLike('example')).toBeFalsy();
        expect(isUrlLike('example.')).toBeFalsy();
        expect(isUrlLike('.com')).toBeFalsy();
        expect(isUrlLike('')).toBeFalsy();
        expect(isUrlLike('just text')).toBeFalsy();
    });

    it('should return false for non-string inputs', () => {
        // @ts-ignore to simulate incorrect input
        expect(isUrlLike(null)).toBeFalsy();
        // @ts-ignore to simulate incorrect input
        expect(isUrlLike(undefined)).toBeFalsy();
        // @ts-ignore to simulate incorrect input
        expect(isUrlLike(123)).toBeFalsy();
    });

    it('should handle edge cases', () => {
        expect(isUrlLike(' google.com ')).toBeTruthy();
        expect(isUrlLike('a.b')).toBeFalsy();
        expect(isUrlLike('localhost')).toBeFalsy();
    });
});

describe.concurrent('bookmark.createBookmarkHTML', () => {
    it('should create correct HTML for a single bookmark', () => {
        const bm: BookmarkToExport = {
            url: 'https://example.com',
            add_date: 1695748000,
            title: 'Example',
        };

        const expectedHTML = `<DT><A HREF="https://example.com" ADD_DATE="1695748000">Example</A>`;
        expect(bookmark._createHTML(bm)).toBe(expectedHTML);
    });
});

describe.concurrent('bookmark.createBookmarksDocument', () => {
    it('should create a complete bookmarks document', () => {
        const bms: BookmarkToExport[] = [
            {
                url: 'https://example.com',
                add_date: 1695748000,
                title: 'Example',
            },
            {
                url: 'https://another.com',
                add_date: 1695752000,
                title: 'Another Example',
            },
        ];

        const expectedDocument = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
<!-- This is an automatically generated file.
     It will be read and overwritten.
     DO NOT EDIT! -->
<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
<TITLE>Bookmarks</TITLE>
<H1>Bookmarks</H1>
<DL><p>
<DT><A HREF="https://example.com" ADD_DATE="1695748000">Example</A>
<DT><A HREF="https://another.com" ADD_DATE="1695752000">Another Example</A>
</DL><p>`;
        expect(bookmark.createDocument(bms)).toBe(expectedDocument);
    });

    it('should create an empty document for no bookmarks', () => {
        const bm: BookmarkToExport[] = [];

        const expectedDocument = `<!DOCTYPE NETSCAPE-Bookmark-file-1>
	<!-- This is an automatically generated file.
			 It will be read and overwritten.
			 DO NOT EDIT! -->
	<META HTTP-EQUIV="Content-Type" CONTENT="text/html; charset=UTF-8">
	<TITLE>Bookmarks</TITLE>
	<H1>Bookmarks</H1>
	<DL><p>
	</DL><p>`;

        expect(bookmark.createDocument(bm).replace(/\s+/g, ' ').trim()).toBe(
            expectedDocument.replace(/\s+/g, ' ').trim(),
        );
    });
});

describe.concurrent('addHttps', () => {
    it('should throw an error for empty URL', () => {
        expect(() => addHttps('')).toThrow('Invalid input: URL cannot be empty');
    });

    it('should return the same URL if it starts with https://', () => {
        const url = 'https://example.com';
        expect(addHttps(url)).toBe(url);
    });

    it('should convert http:// to https://', () => {
        const url = 'http://example.com';
        expect(addHttps(url)).toBe('https://example.com');
    });

    it('should remove leading slashes and add https://', () => {
        const url = '///example.com';
        expect(addHttps(url)).toBe('https://example.com');
    });

    it('should handle URLs with leading whitespace', () => {
        const url = '   http://example.com';
        expect(addHttps(url)).toBe('https://example.com');
    });
});

describe.concurrent('fetchPageTitle', () => {
    it('should return the title of a valid page', async () => {
        const url = 'https://example.com';
        const title = await fetchPageTitle(url);
        expect(title).toBeDefined();
    });

    it('should return "Untitled" for a non-200 response', async () => {
        const url = 'http://localhost/404';
        const title = await fetchPageTitle(url);
        expect(title).toBe('Untitled');
    });

    it('should return "Untitled" for an invalid URL', async () => {
        const url = 'invalid-url';
        const title = await fetchPageTitle(url);
        expect(title).toBe('Untitled');
    });
});

describe.concurrent('getApiKey', () => {
    it('should return the API key from the X-API-KEY header', () => {
        const req = {
            header: vi.fn().mockReturnValue('test-api-key'),
        } as unknown as Request;

        expect(getApiKey(req)).toBe('test-api-key');
        expect(req.header).toHaveBeenCalledWith('X-API-KEY');
    });

    it('should return the Bearer token from the Authorization header', () => {
        const req = {
            header: vi.fn().mockReturnValue('Bearer test-bearer-token'),
        } as unknown as Request;

        expect(getApiKey(req)).toBe('test-bearer-token');
        expect(req.header).toHaveBeenCalledWith('Authorization');
    });

    it('should return undefined if no API key or Bearer token is present', () => {
        const req = {
            header: vi.fn().mockReturnValue(undefined),
        } as unknown as Request;

        expect(getApiKey(req)).toBeUndefined();
    });
});

describe.concurrent('isApiRequest', () => {
    it('should return true if API key is present', () => {
        const req = {
            header: vi.fn().mockReturnValue('test-api-key'),
            path: '/some/path',
        } as unknown as Request;

        expect(isApiRequest(req)).toBe(true);
    });

    it('should return true if path starts with /api', () => {
        const req = {
            header: vi.fn().mockReturnValue(undefined),
            path: '/api/some/path',
        } as unknown as Request;

        expect(isApiRequest(req)).toBe(true);
    });

    it('should return true if expectJson returns true', () => {
        const req = {
            header: vi.fn().mockReturnValue('application/json'),
            path: '/some/path',
        } as unknown as Request;

        expect(isApiRequest(req)).toBe(true);
    });

    it('should return false if none of the conditions are met', () => {
        const req = {
            header: vi.fn().mockReturnValue(undefined),
            path: '/some/path',
        } as unknown as Request;

        expect(isApiRequest(req)).toBe(false);
    });
});

describe.concurrent('expectJson', () => {
    it('should return true if Content-Type is application/json', () => {
        const req = {
            header: vi.fn().mockReturnValue('application/json'),
        } as unknown as Request;

        expect(expectJson(req)).toBe(true);
    });

    it('should return false if Content-Type is not application/json', () => {
        const req = {
            header: vi.fn().mockReturnValue('text/html'),
        } as unknown as Request;

        expect(expectJson(req)).toBe(false);
    });
});

describe('extractUser', () => {
    beforeAll(async () => {
        await db('users').del();
        await db('users').insert({
            id: 1,
            username: 'Test User',
            email: 'testuser@example.com',
            is_admin: false,
            default_search_provider: 'duckduckgo',
            column_preferences: JSON.stringify({
                bookmarks: {
                    title: true,
                    url: true,
                    created_at: true,
                    default_per_page: 10,
                },
                actions: {
                    name: true,
                    trigger: true,
                    url: true,
                    action_type: true,
                    created_at: true,
                    last_read_at: true,
                    default_per_page: 10,
                },
            }),
        });
    });

    afterAll(async () => {
        await db('users').where({ id: 1 }).delete();
    });

    it('should return user from apiKeyPayload if isApiRequest is true', async () => {
        const req = {
            path: '/api/test',
            apiKeyPayload: { userId: 1 },
            session: {},
            header: vi.fn().mockReturnValue(undefined),
        } as unknown as Request;

        const user = await extractUser(req);

        expect(user).toEqual({
            id: 1,
            username: 'Test User',
            email: 'testuser@example.com',
            is_admin: 0,
            default_search_provider: 'duckduckgo',
            autocomplete_search_on_homepage: 0,
            api_key: null,
            api_key_created_at: null,
            api_key_version: 0,
            column_preferences: JSON.stringify({
                bookmarks: {
                    title: true,
                    url: true,
                    created_at: true,
                    default_per_page: 10,
                },
                actions: {
                    name: true,
                    trigger: true,
                    url: true,
                    action_type: true,
                    created_at: true,
                    last_read_at: true,
                    default_per_page: 10,
                },
            }),
            email_verified_at: null,
            timezone: 'UTC',
            created_at: expect.any(String),
            updated_at: expect.any(String),
        });
    });

    it('should return user from session if apiKeyPayload is not present', async () => {
        const req = {
            path: '/api',
            session: { user: { id: 2, name: 'Session User' } },
            header: vi.fn().mockReturnValue(undefined),
        } as unknown as Request;

        const user = await extractUser(req);
        expect(user).toEqual({ id: 2, name: 'Session User' });
    });

    it('should throw an error if user is not found', async () => {
        const req = {
            path: '/api',
            session: {},
            header: vi.fn().mockReturnValue(undefined),
        } as unknown as Request;

        await expect(extractUser(req)).rejects.toThrow('User not found from request!');
    });
});

describe.concurrent('extractPagination', () => {
    it('should return pagination parameters from the request', () => {
        const req = {
            query: {
                per_page: '10',
                page: '2',
                search: 'test',
                sort_key: 'title',
                direction: 'asc',
            },
            user: {
                column_preferences: {
                    bookmarks: { default_per_page: 5 },
                    actions: { default_per_page: 5 },
                },
            },
        } as unknown as Request;

        const pagination = extractPagination(req, 'bookmarks');
        expect(pagination).toEqual({
            perPage: 10,
            page: 2,
            search: 'test',
            sortKey: 'title',
            direction: 'asc',
        });
    });

    it('should return default values if query parameters are not provided', () => {
        const req = {
            query: {},
            user: {
                column_preferences: {
                    bookmarks: { default_per_page: 5 },
                    actions: { default_per_page: 5 },
                },
            },
        } as unknown as Request;

        const pagination = extractPagination(req, 'bookmarks');
        expect(pagination).toEqual({
            perPage: 5,
            page: 1,
            search: '',
            sortKey: 'created_at',
            direction: 'desc',
        });
    });
});

describe('api', () => {
    beforeAll(async () => {
        await db('users').del();
        await db('users').insert({
            id: 1,
            username: 'Test User',
            email: 'testuser@example.com',
            api_key: 'test-api-key',
            api_key_version: 1,
        });
    });

    afterAll(async () => {
        await db('users').where({ id: 1 }).delete();
    });

    afterEach(async () => {
        await db('users').where({ id: 1 }).update({
            api_key: 'test-api-key',
            api_key_version: 1,
        });
    });

    describe('generate', () => {
        it('should generate a valid API key', async () => {
            const payload = { userId: 1, apiKeyVersion: 1 };
            const apiKey = await api.generate(payload);

            const decoded = jwt.verify(apiKey, config.app.apiKeySecret) as ApiKeyPayload;
            expect(decoded.userId).toBe(payload.userId);
            expect(decoded.apiKeyVersion).toBe(payload.apiKeyVersion);
        });
    });

    describe('verify', () => {
        it('should return payload for a valid API key', async () => {
            const payload = { userId: 1, apiKeyVersion: 1 };
            const apiKey = await api.generate(payload);

            await db('users').where({ id: 1 }).update({
                api_key: apiKey,
                api_key_version: payload.apiKeyVersion,
            });

            const verifiedPayload = await api.verify(apiKey);
            expect(verifiedPayload).toEqual(expect.objectContaining(payload));
        });

        it('should return null for an invalid API key', async () => {
            const invalidApiKey = 'invalid-api-key';
            const verifiedPayload = await api.verify(invalidApiKey);
            expect(verifiedPayload).toBeNull();
        });

        it('should return null if the API key does not match the user', async () => {
            const payload = { userId: 1, apiKeyVersion: 1 };
            const apiKey = await api.generate(payload);

            await db('users').where({ id: 1 }).update({ api_key: 'different-api-key' });

            const verifiedPayload = await api.verify(apiKey);
            expect(verifiedPayload).toBeNull();

            await db('users').where({ id: 1 }).update({
                api_key: 'test-api-key',
                api_key_version: 1,
            });
        });
    });
});

describe.concurrent('highlightSearchTerm', () => {
    it('should return original text when search term is null or undefined', () => {
        const text = 'This is a test';
        expect(highlightSearchTerm(text, null)).toBe(text);
        expect(highlightSearchTerm(text, undefined)).toBe(text);
    });

    it('should return null or undefined when text is null or undefined', () => {
        expect(highlightSearchTerm(null, 'test')).toBe(null);
        expect(highlightSearchTerm(undefined, 'test')).toBe(undefined);
    });

    it('should return original text when search term is empty', () => {
        const text = 'This is a test';
        expect(highlightSearchTerm(text, '')).toBe(text);
        expect(highlightSearchTerm(text, '   ')).toBe(text);
    });

    it('should highlight a single word in text', () => {
        const text = 'This is a test';
        const expected = 'This is a <mark>test</mark>';
        expect(highlightSearchTerm(text, 'test')).toBe(expected);
    });

    it('should highlight multiple occurrences of a word', () => {
        const text = 'Test this test and test again';
        const expected = '<mark>Test</mark> this <mark>test</mark> and <mark>test</mark> again';
        expect(highlightSearchTerm(text, 'test')).toBe(expected);
    });

    it('should highlight multiple search words', () => {
        const text = 'The quick brown fox jumps over the lazy dog';
        const expected = 'The <mark>quick</mark> brown <mark>fox</mark> jumps over the lazy dog';
        expect(highlightSearchTerm(text, 'quick fox')).toBe(expected);
    });

    it('should escape HTML in the original text', () => {
        const text = '<p>This is a test</p>';
        const expected = '&lt;p&gt;This is a <mark>test</mark>&lt;/p&gt;';
        expect(highlightSearchTerm(text, 'test')).toBe(expected);
    });

    it('should handle case insensitivity', () => {
        const text = 'This TEST is different from this test';
        const expected = 'This <mark>TEST</mark> is different from this <mark>test</mark>';
        expect(highlightSearchTerm(text, 'test')).toBe(expected);
    });

    it('should handle special regex characters in search term', () => {
        const text = 'Special characters like * and + need escaping';
        const expected = 'Special characters like <mark>*</mark> and <mark>+</mark> need escaping';
        expect(highlightSearchTerm(text, '* +')).toBe(expected);
    });

    it('should handle complex HTML with nested elements', () => {
        const text = '<div><p>This is a <strong>test</strong> of HTML</p></div>';
        const expected =
            '&lt;div&gt;&lt;p&gt;This is a &lt;strong&gt;<mark>test</mark>&lt;/strong&gt; of <mark>HTML</mark>&lt;/p&gt;&lt;/div&gt;';
        expect(highlightSearchTerm(text, 'test HTML')).toBe(expected);
    });

    it('should handle non-string inputs by converting them to strings', () => {
        // @ts-ignore - Testing with number input
        expect(highlightSearchTerm(123, '2')).toBe('1<mark>2</mark>3');

        // @ts-ignore - Testing with object input
        const obj = { toString: () => 'test object' };
        // @ts-ignore - Testing with object input
        expect(highlightSearchTerm(obj, 'object')).toBe('test <mark>object</mark>');
    });

    it('should return original text when no search words match', () => {
        const text = 'This is a test';
        const escaped = 'This is a test';
        expect(highlightSearchTerm(text, 'xyz')).toBe(escaped);
    });
});

describe.concurrent('nl2br', () => {
    it('should return empty string for null or undefined input', () => {
        // @ts-ignore - Testing with null input
        expect(nl2br(null)).toBe('');
        // @ts-ignore - Testing with undefined input
        expect(nl2br(undefined)).toBe('');
    });

    it('should convert newlines to <br> tags', () => {
        expect(nl2br('line1\nline2')).toBe('line1<br>line2');
        expect(nl2br('line1\r\nline2')).toBe('line1<br>line2');
        expect(nl2br('line1\rline2')).toBe('line1<br>line2');
    });

    it('should convert tabs to four non-breaking spaces', () => {
        expect(nl2br('text\tmore')).toBe('text&nbsp;&nbsp;&nbsp;&nbsp;more');
    });

    it('should convert spaces to non-breaking spaces', () => {
        expect(nl2br('text more')).toBe('text&nbsp;more');
    });

    it('should handle multiple and mixed line breaks, tabs, and spaces', () => {
        expect(nl2br('line1\n\nline3')).toBe('line1<br><br>line3');
        expect(nl2br('line1\r\n\r\nline3')).toBe('line1<br><br>line3');
        expect(nl2br('text\t\tmore')).toBe(
            'text&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;more',
        );
        expect(nl2br('text  more')).toBe('text&nbsp;&nbsp;more');
        expect(nl2br('line1\n\tline2')).toBe('line1<br>&nbsp;&nbsp;&nbsp;&nbsp;line2');
    });

    it('should handle non-string inputs by converting them to strings', () => {
        // @ts-ignore - Testing with number input
        expect(nl2br(123)).toBe('123');

        // @ts-ignore - Testing with object input
        const obj = { toString: () => 'test object' };
        // @ts-ignore - Testing with object input
        expect(nl2br(obj)).toBe('test&nbsp;object');
    });

    it('should preserve other characters', () => {
        expect(nl2br('line1\nline2!@#$%^&*()')).toBe('line1<br>line2!@#$%^&*()');
    });
});

describe.concurrent('extractReadmeUsage', () => {
    it('should extract content between start and end markers', () => {
        const readmeContent = `
# README

Some intro text

<!-- starts -->
This is the usage content
that should be extracted
<!-- ends -->

Some other content
        `;

        const result = extractReadmeUsage(readmeContent);
        expect(result).toBe('This is the usage content\nthat should be extracted');
    });

    it('should return empty string if start marker is not found', () => {
        const readmeContent = `
# README
Some content without start marker
<!-- ends -->
        `;

        const result = extractReadmeUsage(readmeContent);
        expect(result).toBe('');
    });

    it('should return empty string if end marker is not found', () => {
        const readmeContent = `
# README
<!-- starts -->
Some content without end marker
        `;

        const result = extractReadmeUsage(readmeContent);
        expect(result).toBe('');
    });

    it('should return empty string if end marker comes before start marker', () => {
        const readmeContent = `
# README
<!-- ends -->
Some content
<!-- starts -->
        `;

        const result = extractReadmeUsage(readmeContent);
        expect(result).toBe('');
    });

    it('should handle empty content between markers', () => {
        const readmeContent = `
# README
<!-- starts --><!-- ends -->
        `;

        const result = extractReadmeUsage(readmeContent);
        expect(result).toBe('');
    });
});

describe.concurrent('isOnlyLettersAndNumbers', () => {
    it('should return true for strings with only letters and numbers', () => {
        expect(isOnlyLettersAndNumbers('abc123')).toBe(true);
        expect(isOnlyLettersAndNumbers('ABC123')).toBe(true);
        expect(isOnlyLettersAndNumbers('abcDEF123')).toBe(true);
        expect(isOnlyLettersAndNumbers('123')).toBe(true);
        expect(isOnlyLettersAndNumbers('abc')).toBe(true);
    });

    it('should return false for strings with special characters', () => {
        expect(isOnlyLettersAndNumbers('abc-123')).toBe(false);
        expect(isOnlyLettersAndNumbers('abc_123')).toBe(false);
        expect(isOnlyLettersAndNumbers('abc 123')).toBe(false);
        expect(isOnlyLettersAndNumbers('abc@123')).toBe(false);
        expect(isOnlyLettersAndNumbers('abc.123')).toBe(false);
    });

    it('should return false for empty string', () => {
        expect(isOnlyLettersAndNumbers('')).toBe(false);
    });

    it('should return false for strings with unicode characters', () => {
        expect(isOnlyLettersAndNumbers('abc123ñ')).toBe(false);
        expect(isOnlyLettersAndNumbers('abc123é')).toBe(false);
    });
});

describe('getReadmeFileContent', () => {
    it('should return empty string if README.md does not exist', async () => {
        const result = await getReadmeFileContent();
        expect(typeof result).toBe('string');
    });
});

describe('getConvertedReadmeMDToHTML', () => {
    it('should return cached HTML on subsequent calls', async () => {
        const result1 = await getConvertedReadmeMDToHTML();
        const result2 = await getConvertedReadmeMDToHTML();

        expect(typeof result1).toBe('string');
        expect(result1).toBe(result2);
    });
});

describe('insertBookmark', () => {
    beforeAll(async () => {
        await db('bookmarks').del();
        await db('users').del();
        await db('users').insert({
            id: 1,
            username: 'Test User',
            email: 'testuser@example.com',
            is_admin: false,
            default_search_provider: 'duckduckgo',
            column_preferences: JSON.stringify({
                bookmarks: { default_per_page: 10 },
                actions: { default_per_page: 10 },
                notes: { default_per_page: 10 },
            }),
        });
    });

    afterAll(async () => {
        await db('bookmarks').del();
        await db('users').where({ id: 1 }).delete();
    });

    it('should insert bookmark with provided title', async () => {
        await insertBookmark({
            url: 'https://example.com',
            userId: 1,
            title: 'Example Site',
        });

        const bookmark = await db('bookmarks').where({ url: 'https://example.com' }).first();
        expect(bookmark).toBeDefined();
        expect(bookmark.title).toBe('Example Site');
        expect(bookmark.url).toBe('https://example.com');
        expect(bookmark.user_id).toBe(1);
    });

    it('should insert bookmark with default title when title is not provided', async () => {
        await insertBookmark({
            url: 'https://example2.com',
            userId: 1,
        });

        const bookmark = await db('bookmarks').where({ url: 'https://example2.com' }).first();
        expect(bookmark).toBeDefined();
        expect(bookmark.title).toBe('Fetching title...');
        expect(bookmark.url).toBe('https://example2.com');
        expect(bookmark.user_id).toBe(1);
    });
});

describe.concurrent('.dockerignore', () => {
    it('cannot have README.md or *.md', async () => {
        const result = await fs.readFile(
            path.resolve(path.join(process.cwd(), '.dockerignore')),
            'utf8',
        );
        expect(result).not.toContain('README.md');
        expect(result).not.toContain('*.md');
    });
});

describe.concurrent('README.md', () => {
    it('should have starts and ends', async () => {
        const result = await fs.readFile(
            path.resolve(path.join(process.cwd(), 'README.md')),
            'utf8',
        );
        expect(result).toContain('<!-- starts -->');
        expect(result).toContain('<!-- ends -->');
    });
});

describe('formatDateInTimezone', () => {
    it('should format UTC date to specified timezone with all properties', () => {
        // Test with UTC date string
        const utcDate = '2025-08-07 19:48:54';
        const result = formatDateInTimezone(utcDate, 'America/Chicago');

        expect(result).toHaveProperty('dateString');
        expect(result).toHaveProperty('timeString');
        expect(result).toHaveProperty('fullString');
        expect(result).toHaveProperty('dateInputValue');
        expect(result).toHaveProperty('timeInputValue');

        // Chicago is UTC-5 in summer, so 19:48 UTC = 14:48 (2:48 PM) Chicago
        expect(result.dateString).toBe('8/7/2025');
        expect(result.timeString).toBe('2:48 PM');
        expect(result.fullString).toBe('8/7/2025, 2:48 PM');
        expect(result.dateInputValue).toBe('2025-08-07');
        expect(result.timeInputValue).toBe('14:48');
    });

    it('should handle ISO date strings with timezone conversion', () => {
        const isoDate = '2025-01-15T10:30:00Z';
        const result = formatDateInTimezone(isoDate, 'America/New_York');

        // New York is UTC-5 in winter, so 10:30 UTC = 05:30 (5:30 AM) New York
        expect(result.dateString).toBe('1/15/2025');
        expect(result.timeString).toBe('5:30 AM');
        expect(result.fullString).toBe('1/15/2025, 5:30 AM');
        expect(result.dateInputValue).toBe('2025-01-15');
        expect(result.timeInputValue).toBe('05:30');
    });

    it('should handle Date objects', () => {
        const date = new Date('2025-12-25T18:00:00Z');
        const result = formatDateInTimezone(date, 'Europe/London');

        // London is UTC+0 in winter, so 18:00 UTC = 18:00 (6:00 PM) London
        expect(result.dateString).toBe('12/25/2025');
        expect(result.timeString).toBe('6:00 PM');
        expect(result.fullString).toBe('12/25/2025, 6:00 PM');
        expect(result.dateInputValue).toBe('2025-12-25');
        expect(result.timeInputValue).toBe('18:00');
    });

    it('should default to UTC when no timezone is provided', () => {
        const utcDate = '2025-06-15 09:15:00';
        const result = formatDateInTimezone(utcDate);

        expect(result.dateString).toBe('6/15/2025');
        expect(result.timeString).toBe('9:15 AM');
        expect(result.fullString).toBe('6/15/2025, 9:15 AM');
        expect(result.dateInputValue).toBe('2025-06-15');
        expect(result.timeInputValue).toBe('09:15');
    });

    it('should handle midnight correctly', () => {
        const midnightUTC = '2025-03-01T00:00:00Z';
        const result = formatDateInTimezone(midnightUTC, 'America/Los_Angeles');

        // LA is UTC-8 in winter, so midnight UTC = 4:00 PM previous day in LA
        expect(result.dateString).toBe('2/28/2025');
        expect(result.timeString).toBe('4:00 PM');
        expect(result.dateInputValue).toBe('2025-02-28');
        expect(result.timeInputValue).toBe('16:00');
    });

    it('should handle noon correctly', () => {
        const noonUTC = '2025-07-15T12:00:00Z';
        const result = formatDateInTimezone(noonUTC, 'Asia/Tokyo');

        // Tokyo is UTC+9, so noon UTC = 9:00 PM Tokyo
        expect(result.dateString).toBe('7/15/2025');
        expect(result.timeString).toBe('9:00 PM');
        expect(result.dateInputValue).toBe('2025-07-15');
        expect(result.timeInputValue).toBe('21:00');
    });

    it('should handle invalid date gracefully with fallback', () => {
        const invalidDate = 'invalid-date';
        const result = formatDateInTimezone(invalidDate, 'America/Chicago');

        // Should still return all properties even with fallback
        expect(result).toHaveProperty('dateString');
        expect(result).toHaveProperty('timeString');
        expect(result).toHaveProperty('fullString');
        expect(result).toHaveProperty('dateInputValue');
        expect(result).toHaveProperty('timeInputValue');
    });

    it('should format time inputs correctly for single-digit hours', () => {
        // Test 1:05 AM
        const earlyMorning = '2025-04-10T06:05:00Z';
        const result1 = formatDateInTimezone(earlyMorning, 'America/New_York');

        // NYC is UTC-4 in April, so 6:05 UTC = 2:05 AM NYC
        expect(result1.timeString).toBe('2:05 AM');
        expect(result1.timeInputValue).toBe('02:05');

        // Test 9:30 AM
        const morning = '2025-04-10T13:30:00Z';
        const result2 = formatDateInTimezone(morning, 'America/New_York');

        // 13:30 UTC = 9:30 AM NYC
        expect(result2.timeString).toBe('9:30 AM');
        expect(result2.timeInputValue).toBe('09:30');
    });
});

describe('processReminderDigests', () => {
    let testUserId: number;

    beforeAll(async () => {
        await db('reminders').del();
        await db('users').del();

        const [user] = await db('users')
            .insert({
                username: 'testuser',
                email: 'test@example.com',
                timezone: 'America/Chicago',
            })
            .returning('id');
        testUserId = user.id;
    });

    afterAll(async () => {
        await db('reminders').del();
        await db('users').del();
    });

    beforeEach(async () => {
        await db('reminders').del();
    });

    it('should find due reminders in the next 15 minutes and handle timezone correctly', async () => {
        const now = new Date();
        const in10Minutes = new Date(now.getTime() + 10 * 60 * 1000);
        const in20Minutes = new Date(now.getTime() + 20 * 60 * 1000);

        await db('reminders').insert([
            {
                user_id: testUserId,
                title: 'Due Soon',
                reminder_type: 'once',
                due_date: in10Minutes.toISOString(),
            },
            {
                user_id: testUserId,
                title: 'Due Later',
                reminder_type: 'once',
                due_date: in20Minutes.toISOString(),
            },
            {
                user_id: testUserId,
                title: 'Already Due',
                reminder_type: 'once',
                due_date: new Date(now.getTime() - 20 * 60 * 1000).toISOString(), // 20 minutes ago
            },
        ]);

        await processReminderDigests();

        // Check that one-time reminder was deleted (this confirms processing happened)
        const remainingReminders = await db('reminders').where('title', 'Due Soon');
        expect(remainingReminders).toHaveLength(0);

        // Check that future reminder is still there
        const futureReminders = await db('reminders').where('title', 'Due Later');
        expect(futureReminders).toHaveLength(1);

        // Check that past due reminder is still there (not processed since it's outside the window)
        const pastDueReminders = await db('reminders').where('title', 'Already Due');
        expect(pastDueReminders).toHaveLength(1);
    });

    it('should handle recurring reminders and calculate next due date correctly', async () => {
        const now = new Date();
        const in5Minutes = new Date(now.getTime() + 5 * 60 * 1000);

        // Create recurring reminders for different frequencies
        await db('reminders').insert([
            {
                user_id: testUserId,
                title: 'Daily Reminder',
                reminder_type: 'recurring',
                frequency: 'daily',
                due_date: in5Minutes.toISOString(),
            },
            {
                user_id: testUserId,
                title: 'Weekly Reminder',
                reminder_type: 'recurring',
                frequency: 'weekly',
                due_date: in5Minutes.toISOString(),
            },
        ]);

        await processReminderDigests();

        // Check that recurring reminders were updated with next due dates
        const dailyReminder = await db('reminders').where('title', 'Daily Reminder').first();
        const weeklyReminder = await db('reminders').where('title', 'Weekly Reminder').first();

        expect(dailyReminder).toBeTruthy();
        expect(weeklyReminder).toBeTruthy();

        // Check that next due dates are calculated correctly (approximately)
        const originalDue = new Date(in5Minutes);
        const dailyNextDue = new Date(dailyReminder.due_date);
        const weeklyNextDue = new Date(weeklyReminder.due_date);

        // Daily should be ~24 hours later
        expect(dailyNextDue.getTime() - originalDue.getTime()).toBeCloseTo(24 * 60 * 60 * 1000, -4);

        // Weekly should be scheduled for next Saturday after processing
        const weeklyDue = dayjs(weeklyReminder.due_date);
        expect(weeklyDue.day()).toBe(6); // 6 = Saturday

        // Since the reminder is processed and moved to the next occurrence,
        // it should be approximately 7 days in the future (next Saturday)
        const weeklyDiff = weeklyNextDue.getTime() - originalDue.getTime();
        expect(weeklyDiff).toBeGreaterThan(6 * 24 * 60 * 60 * 1000); // More than 6 days
        expect(weeklyDiff).toBeLessThanOrEqual(14 * 24 * 60 * 60 * 1000); // Less than 14 days

        // Recurring reminders should have their due dates updated
    });

    it('should handle no due reminders gracefully', async () => {
        const farFuture = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2 hours from now

        await db('reminders').insert({
            user_id: testUserId,
            title: 'Far Future',
            reminder_type: 'once',
            due_date: farFuture.toISOString(),
        });

        // Should not throw an error
        await expect(processReminderDigests()).resolves.not.toThrow();

        // Reminder should still exist (not processed since it's not due)
        const reminders = await db('reminders').where('title', 'Far Future');
        expect(reminders).toHaveLength(1);
    });

    it('should use UTC for database queries and handle user timezones for email formatting', async () => {
        // This test validates that the function uses UTC for database operations
        const now = new Date();
        const in5Minutes = new Date(now.getTime() + 5 * 60 * 1000);

        // Create a reminder that should be found (due within 15 minutes from UTC perspective)
        await db('reminders').insert({
            user_id: testUserId,
            title: 'UTC Test',
            reminder_type: 'once',
            due_date: in5Minutes.toISOString(), // This is in UTC
        });

        await processReminderDigests();

        // The reminder should have been processed (deleted for one-time reminders)
        const remainingReminders = await db('reminders').where('title', 'UTC Test');
        expect(remainingReminders).toHaveLength(0);
    });

    it('should schedule weekly reminders for Saturday and monthly for the 1st', async () => {
        const now = new Date();
        const in5Minutes = new Date(now.getTime() + 5 * 60 * 1000);

        // Create weekly and monthly reminders
        await db('reminders').insert([
            {
                user_id: testUserId,
                title: 'Weekly Report',
                reminder_type: 'recurring',
                frequency: 'weekly',
                due_date: in5Minutes.toISOString(),
            },
            {
                user_id: testUserId,
                title: 'Monthly Review',
                reminder_type: 'recurring',
                frequency: 'monthly',
                due_date: in5Minutes.toISOString(),
            },
        ]);

        await processReminderDigests();

        // Check that reminders were rescheduled
        const weeklyReminder = await db('reminders').where('title', 'Weekly Report').first();
        const monthlyReminder = await db('reminders').where('title', 'Monthly Review').first();

        expect(weeklyReminder).toBeTruthy();
        expect(monthlyReminder).toBeTruthy();

        // Weekly reminder should be scheduled for next Saturday
        const weeklyDue = dayjs(weeklyReminder.due_date);
        expect(weeklyDue.day()).toBe(6); // 6 = Saturday

        // Monthly reminder should be scheduled for the 1st of next month
        const monthlyDue = dayjs(monthlyReminder.due_date);
        expect(monthlyDue.date()).toBe(1); // 1st of the month
    });

    it('should create new weekly reminders on Saturday and monthly on the 1st', async () => {
        const now = new Date();
        const in5Minutes = new Date(now.getTime() + 5 * 60 * 1000);

        // Create weekly and monthly reminders
        await db('reminders').insert([
            {
                user_id: testUserId,
                title: 'Weekly Report',
                reminder_type: 'recurring',
                frequency: 'weekly',
                due_date: in5Minutes.toISOString(),
            },
            {
                user_id: testUserId,
                title: 'Monthly Review',
                reminder_type: 'recurring',
                frequency: 'monthly',
                due_date: in5Minutes.toISOString(),
            },
        ]);

        await processReminderDigests();

        // Check that reminders were rescheduled
        const weeklyReminder = await db('reminders').where('title', 'Weekly Report').first();
        const monthlyReminder = await db('reminders').where('title', 'Monthly Review').first();

        expect(weeklyReminder).toBeTruthy();
        expect(monthlyReminder).toBeTruthy();

        // Weekly reminder should be scheduled for next Saturday
        const weeklyDue = dayjs(weeklyReminder.due_date);
        expect(weeklyDue.day()).toBe(6); // 6 = Saturday

        // Monthly reminder should be scheduled for the 1st of next month
        const monthlyDue = dayjs(monthlyReminder.due_date);
        expect(monthlyDue.date()).toBe(1); // 1st of the month
    });

    it('should allow daily reminders to be processed multiple times', async () => {
        const now = new Date();
        const in5Minutes = new Date(now.getTime() + 5 * 60 * 1000);

        // Create a daily recurring reminder
        await db('reminders').insert({
            user_id: testUserId,
            title: 'Multi-Day Daily Reminder',
            reminder_type: 'recurring',
            frequency: 'daily',
            due_date: in5Minutes.toISOString(),
        });

        // First processing
        await processReminderDigests();

        let reminder = await db('reminders').where('title', 'Multi-Day Daily Reminder').first();
        expect(reminder).toBeTruthy();

        // After first processing, the reminder should have been updated to tomorrow
        const firstDue = new Date(reminder.due_date);

        // Since the reminder was already processed and moved to next day,
        // it won't be due for processing until tomorrow.
        // To test multiple processing, we need to manually update it to be due again
        const nowAgain = new Date();
        const in5MinutesAgain = new Date(nowAgain.getTime() + 5 * 60 * 1000);

        await db('reminders')
            .where('title', 'Multi-Day Daily Reminder')
            .update({ due_date: in5MinutesAgain.toISOString() });

        // Second processing
        await processReminderDigests();

        reminder = await db('reminders').where('title', 'Multi-Day Daily Reminder').first();
        expect(reminder).toBeTruthy();

        // Verify the due date was updated to the following day from the second processing
        const updatedDue = new Date(reminder.due_date);
        expect(updatedDue.getTime() - in5MinutesAgain.getTime()).toBeCloseTo(
            24 * 60 * 60 * 1000,
            -4,
        );
    });
});
