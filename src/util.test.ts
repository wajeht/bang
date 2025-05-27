import {
    api,
    nl2br,
    bookmark,
    addHttps,
    getApiKey,
    isValidUrl,
    expectJson,
    extractUser,
    isApiRequest,
    fetchPageTitle,
    insertBookmark,
    extractPagination,
    extractReadmeUsage,
    highlightSearchTerm,
    getReadmeFileContent,
    isOnlyLettersAndNumbers,
    getConvertedReadmeMDToHTML,
} from './util';
import path from 'node:path';
import { db } from './db/db';
import jwt from 'jsonwebtoken';
import fs from 'node:fs/promises';
import { Request } from 'express';
import { appConfig } from './config';
import { ApiKeyPayload, BookmarkToExport } from './type';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

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
        const url = 'https://example.com'; // Replace with a valid URL for testing
        const title = await fetchPageTitle(url);
        expect(title).toBeDefined(); // Check that a title is returned
    });

    it('should return "Untitled" for a non-200 response', async () => {
        const url = 'https://httpstat.us/404'; // A URL that returns a 404
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
                    default_per_page: 10,
                },
            }),
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

describe.concurrent('api', () => {
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

    describe('generate', () => {
        it('should generate a valid API key', async () => {
            const payload = { userId: 1, apiKeyVersion: 1 };
            const apiKey = await api.generate(payload);

            const decoded = jwt.verify(apiKey, appConfig.apiKeySecret) as ApiKeyPayload;
            expect(decoded.userId).toBe(payload.userId);
            expect(decoded.apiKeyVersion).toBe(payload.apiKeyVersion);
        });
    });

    describe('verify', () => {
        it.skip('should return payload for a valid API key', async () => {
            const payload = { userId: 1, apiKeyVersion: 1 };
            const apiKey = await api.generate(payload);

            const verifiedPayload = await api.verify(apiKey);
            expect(verifiedPayload).toEqual(payload);
        });

        it('should return null for an invalid API key', async () => {
            const invalidApiKey = 'invalid-api-key';
            const verifiedPayload = await api.verify(invalidApiKey);
            expect(verifiedPayload).toBeNull();
        });

        it('should return null if the API key does not match the user', async () => {
            const payload = { userId: 1, apiKeyVersion: 1 };
            const apiKey = await api.generate(payload);

            // Update the user to have a different API key
            await db('users').where({ id: 1 }).update({ api_key: 'different-api-key' });

            const verifiedPayload = await api.verify(apiKey);
            expect(verifiedPayload).toBeNull();
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
        const escaped = 'This is a test'; // No HTML entities to escape in this simple case
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
    it('cannot have README.md', async () => {
        const result = await fs.readFile(
            path.resolve(path.join(process.cwd(), '.dockerignore')),
            'utf8',
        );
        expect(result).not.toContain('README.md');
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
