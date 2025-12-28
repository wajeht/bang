import path from 'node:path';
import { Utils } from './util';
import { libs } from '../libs';
import fs from 'node:fs/promises';
import { Request } from 'express';
import { config } from '../config';
import { AuthUtils } from './auth';
import { HtmlUtils } from './html';
import { DateUtils } from './date';
import { MailUtils } from './mail';
import { RequestUtils } from './request';
import { db } from '../tests/test-setup';
import { ValidationUtils } from './validation';
import type { ApiKeyPayload, BookmarkToExport } from '../type';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let validationUtils: ReturnType<typeof ValidationUtils>;
let authUtils: ReturnType<typeof AuthUtils>;
let utilUtils: ReturnType<typeof Utils>;
let htmlUtils: ReturnType<typeof HtmlUtils>;
let dateUtils: ReturnType<typeof DateUtils>;
let requestUtils: ReturnType<typeof RequestUtils>;
let mailUtils: ReturnType<typeof MailUtils>;

beforeAll(async () => {
    const { BookmarksRepository } = await import('../routes/bookmarks/bookmarks.repository');
    const { SettingsRepository } = await import('../routes/admin/settings.repository');

    const mockContext = {
        db,
        config,
        libs,
        logger: { error: vi.fn(), info: vi.fn() },
        utils: {} as any,
        models: {} as any,
        errors: {} as any,
    } as any;

    validationUtils = ValidationUtils();
    authUtils = AuthUtils(mockContext);
    htmlUtils = HtmlUtils();
    dateUtils = DateUtils(mockContext);
    requestUtils = RequestUtils(mockContext);

    mockContext.utils = {
        validation: validationUtils,
        auth: authUtils,
        html: htmlUtils,
        date: dateUtils,
        request: requestUtils,
    };

    mockContext.models = {
        bookmarks: BookmarksRepository(mockContext),
        settings: SettingsRepository(mockContext),
    };

    utilUtils = Utils(mockContext);
    mailUtils = MailUtils(mockContext);

    mockContext.utils.util = utilUtils;
    mockContext.utils.mail = mailUtils;
});

describe.concurrent('truncateString', () => {
    it('should truncate to default char limit', () => {
        expect(utilUtils.truncateString('something else')).toBe('somet...');
    });

    it('should truncate to given char limit', () => {
        expect(utilUtils.truncateString('something else', 1)).toBe('s...');
    });

    it('should not truncate on empty string', () => {
        expect(utilUtils.truncateString('')).toBe('');
    });

    it('should not start from space char to truncate if maxLength index char is at space', () => {
        expect(utilUtils.truncateString('rick rol', 5)).toBe('rick...');
    });
});

describe.concurrent('isValidUrl', () => {
    it('should return true for valid URLs', () => {
        expect(validationUtils.isValidUrl('https://example.com')).toBeTruthy();
        expect(validationUtils.isValidUrl('http://example.com')).toBeTruthy();
        expect(validationUtils.isValidUrl('ftp://example.com')).toBeTruthy();
        expect(validationUtils.isValidUrl('https://example.com/path?query=param')).toBeTruthy();
    });

    it('should return false for invalid URLs', () => {
        expect(validationUtils.isValidUrl('not-a-url')).toBeFalsy();
        expect(validationUtils.isValidUrl('')).toBeFalsy();
        expect(validationUtils.isValidUrl('example')).toBeFalsy();
    });

    it('should return false for non-string inputs', () => {
        // @ts-ignore to simulate incorrect input
        expect(validationUtils.isValidUrl(null)).toBeFalsy();
        // @ts-ignore to simulate incorrect input
        expect(validationUtils.isValidUrl(undefined)).toBeFalsy();
        // @ts-ignore to simulate incorrect input
        expect(validationUtils.isValidUrl(123)).toBeFalsy();
    });
});

describe.concurrent('isUrlLike', () => {
    it('should return true for valid full URLs', () => {
        expect(validationUtils.isUrlLike('https://example.com')).toBeTruthy();
        expect(validationUtils.isUrlLike('http://example.com')).toBeTruthy();
        expect(validationUtils.isUrlLike('HTTP://EXAMPLE.COM')).toBeTruthy();
        expect(validationUtils.isUrlLike('HTTPS://EXAMPLE.COM')).toBeTruthy();
        expect(validationUtils.isUrlLike('https://sub.example.com')).toBeTruthy();
        expect(validationUtils.isUrlLike('https://example.com/path?query=param')).toBeTruthy();
    });

    it('should return true for domain-like patterns', () => {
        expect(validationUtils.isUrlLike('google.com')).toBeTruthy();
        expect(validationUtils.isUrlLike('google.coM')).toBeTruthy();
        expect(validationUtils.isUrlLike('example.org')).toBeTruthy();
        expect(validationUtils.isUrlLike('sub.domain.co.uk')).toBeTruthy();
        expect(validationUtils.isUrlLike('github.io')).toBeTruthy();
    });

    it('should return true for www patterns', () => {
        expect(validationUtils.isUrlLike('www.google.com')).toBeTruthy();
        expect(validationUtils.isUrlLike('www.Google.COM')).toBeTruthy();
        expect(validationUtils.isUrlLike('WWW.example.org')).toBeTruthy();
    });

    it('should return false for invalid domain patterns', () => {
        expect(validationUtils.isUrlLike('not-a-url')).toBeFalsy();
        expect(validationUtils.isUrlLike('example')).toBeFalsy();
        expect(validationUtils.isUrlLike('example.')).toBeFalsy();
        expect(validationUtils.isUrlLike('.com')).toBeFalsy();
        expect(validationUtils.isUrlLike('')).toBeFalsy();
        expect(validationUtils.isUrlLike('just text')).toBeFalsy();
    });

    it('should return false for non-string inputs', () => {
        // @ts-ignore to simulate incorrect input
        expect(validationUtils.isUrlLike(null)).toBeFalsy();
        // @ts-ignore to simulate incorrect input
        expect(validationUtils.isUrlLike(undefined)).toBeFalsy();
        // @ts-ignore to simulate incorrect input
        expect(validationUtils.isUrlLike(123)).toBeFalsy();
    });

    it('should handle edge cases', () => {
        expect(validationUtils.isUrlLike(' google.com ')).toBeTruthy();
        expect(validationUtils.isUrlLike('a.b')).toBeFalsy();
        expect(validationUtils.isUrlLike('localhost')).toBeFalsy();
    });
});

describe.concurrent('createBookmarkHTML', () => {
    it('should create correct HTML for a single bookmark', () => {
        const bm: BookmarkToExport = {
            url: 'https://example.com',
            add_date: 1695748000,
            title: 'Example',
        };

        const expectedHTML = `<DT><A HREF="https://example.com" ADD_DATE="1695748000">Example</A>`;
        expect(utilUtils.createBookmarkHtml(bm)).toBe(expectedHTML);
    });
});

describe.concurrent('createBookmarksDocument', () => {
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
        expect(utilUtils.createBookmarkDocument(bms)).toBe(expectedDocument);
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

        expect(utilUtils.createBookmarkDocument(bm).replace(/\s+/g, ' ').trim()).toBe(
            expectedDocument.replace(/\s+/g, ' ').trim(),
        );
    });
});

describe.concurrent('addHttps', () => {
    it('should throw an error for empty URL', () => {
        expect(() => utilUtils.ensureHttps('')).toThrow('Invalid input: URL cannot be empty');
    });

    it('should return the same URL if it starts with https://', () => {
        const url = 'https://example.com';
        expect(utilUtils.ensureHttps(url)).toBe(url);
    });

    it('should convert http:// to https://', () => {
        const url = 'http://example.com';
        expect(utilUtils.ensureHttps(url)).toBe('https://example.com');
    });

    it('should remove leading slashes and add https://', () => {
        const url = '///example.com';
        expect(utilUtils.ensureHttps(url)).toBe('https://example.com');
    });

    it('should handle URLs with leading whitespace', () => {
        const url = '   http://example.com';
        expect(utilUtils.ensureHttps(url)).toBe('https://example.com');
    });
});

describe.concurrent('escapeHtml', () => {
    it('should escape ampersands', () => {
        expect(htmlUtils.escapeHtml('Tom & Jerry')).toBe('Tom &amp; Jerry');
    });

    it('should escape less than signs', () => {
        expect(htmlUtils.escapeHtml('5 < 10')).toBe('5 &lt; 10');
    });

    it('should escape greater than signs', () => {
        expect(htmlUtils.escapeHtml('10 > 5')).toBe('10 &gt; 5');
    });

    it('should escape double quotes', () => {
        expect(htmlUtils.escapeHtml('He said "Hello"')).toBe('He said &quot;Hello&quot;');
    });

    it('should escape single quotes', () => {
        expect(htmlUtils.escapeHtml("It's a test")).toBe('It&#39;s a test');
    });

    it('should escape all HTML special characters', () => {
        expect(htmlUtils.escapeHtml('<script>alert("XSS & hack\'s");</script>')).toBe(
            '&lt;script&gt;alert(&quot;XSS &amp; hack&#39;s&quot;);&lt;/script&gt;',
        );
    });

    it('should handle empty string', () => {
        expect(htmlUtils.escapeHtml('')).toBe('');
    });

    it('should handle string with no special characters', () => {
        expect(htmlUtils.escapeHtml('Hello World')).toBe('Hello World');
    });

    it('should handle string with only special characters', () => {
        expect(htmlUtils.escapeHtml('&<>"\'')).toBe('&amp;&lt;&gt;&quot;&#39;');
    });

    it('should handle mixed content with URLs', () => {
        expect(htmlUtils.escapeHtml('Visit <a href="https://example.com">Example & Co.</a>')).toBe(
            'Visit &lt;a href=&quot;https://example.com&quot;&gt;Example &amp; Co.&lt;/a&gt;',
        );
    });
});

describe.concurrent('fetchPageTitle', () => {
    it('should return the title of a valid page', async () => {
        const url = 'https://example.com';
        const title = await utilUtils.fetchPageTitle(url);
        expect(title).toBeDefined();
    });

    it('should return "Untitled" for a non-200 response', async () => {
        const url = 'http://localhost/404';
        const title = await utilUtils.fetchPageTitle(url);
        expect(title).toBe('Untitled');
    });

    it('should return "Untitled" for an invalid URL', async () => {
        const url = 'invalid-url';
        const title = await utilUtils.fetchPageTitle(url);
        expect(title).toBe('Untitled');
    });
});

describe.concurrent('getApiKey', () => {
    it('should return the API key from the X-API-KEY header', () => {
        const req = {
            header: vi.fn().mockReturnValue('test-api-key'),
        } as unknown as Request;

        expect(requestUtils.extractApiKey(req)).toBe('test-api-key');
        expect(req.header).toHaveBeenCalledWith('X-API-KEY');
    });

    it('should return the Bearer token from the Authorization header', () => {
        const req = {
            header: vi.fn().mockReturnValue('Bearer test-bearer-token'),
        } as unknown as Request;

        expect(requestUtils.extractApiKey(req)).toBe('test-bearer-token');
        expect(req.header).toHaveBeenCalledWith('Authorization');
    });

    it('should return undefined if no API key or Bearer token is present', () => {
        const req = {
            header: vi.fn().mockReturnValue(undefined),
        } as unknown as Request;

        expect(requestUtils.extractApiKey(req)).toBeUndefined();
    });
});

describe.concurrent('isApiRequest', () => {
    it('should return true if API key is present', () => {
        const req = {
            header: vi.fn().mockReturnValue('test-api-key'),
            path: '/some/path',
        } as unknown as Request;

        expect(requestUtils.isApiRequest(req)).toBe(true);
    });

    it('should return true if path starts with /api', () => {
        const req = {
            header: vi.fn().mockReturnValue(undefined),
            path: '/api/some/path',
        } as unknown as Request;

        expect(requestUtils.isApiRequest(req)).toBe(true);
    });

    it('should return true if expectJson returns true', () => {
        const req = {
            header: vi.fn().mockReturnValue('application/json'),
            path: '/some/path',
        } as unknown as Request;

        expect(requestUtils.isApiRequest(req)).toBe(true);
    });

    it('should return false if none of the conditions are met', () => {
        const req = {
            header: vi.fn().mockReturnValue(undefined),
            path: '/some/path',
        } as unknown as Request;

        expect(requestUtils.isApiRequest(req)).toBe(false);
    });
});

describe.concurrent('expectJson', () => {
    it('should return true if Content-Type is application/json', () => {
        const req = {
            header: vi.fn().mockReturnValue('application/json'),
        } as unknown as Request;

        expect(requestUtils.expectsJson(req)).toBe(true);
    });

    it('should return false if Content-Type is not application/json', () => {
        const req = {
            header: vi.fn().mockReturnValue('text/html'),
        } as unknown as Request;

        expect(requestUtils.expectsJson(req)).toBe(false);
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

        const pagination = requestUtils.extractPaginationParams(req, 'bookmarks');
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

        const pagination = requestUtils.extractPaginationParams(req, 'bookmarks');
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
            const apiKey = await authUtils.generateApiKey(payload);

            const decoded = libs.jwt.verify(apiKey, config.app.apiKeySecret) as ApiKeyPayload;
            expect(decoded.userId).toBe(payload.userId);
            expect(decoded.apiKeyVersion).toBe(payload.apiKeyVersion);
        });
    });

    describe('verify', () => {
        it('should return payload for a valid API key', async () => {
            const payload = { userId: 1, apiKeyVersion: 1 };
            const apiKey = await authUtils.generateApiKey(payload);

            await db('users').where({ id: 1 }).update({
                api_key: apiKey,
                api_key_version: payload.apiKeyVersion,
            });

            const verifiedPayload = await authUtils.verifyApiKey(apiKey);
            expect(verifiedPayload).toEqual(expect.objectContaining(payload));
        });

        it('should return null for an invalid API key', async () => {
            const invalidApiKey = 'invalid-api-key';
            const verifiedPayload = await authUtils.verifyApiKey(invalidApiKey);
            expect(verifiedPayload).toBeNull();
        });

        it('should return null if the API key does not match the user', async () => {
            const payload = { userId: 1, apiKeyVersion: 1 };
            const apiKey = await authUtils.generateApiKey(payload);

            await db('users').where({ id: 1 }).update({ api_key: 'different-api-key' });

            const verifiedPayload = await authUtils.verifyApiKey(apiKey);
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
        expect(htmlUtils.highlightSearchTerm(text, null)).toBe(text);
        expect(htmlUtils.highlightSearchTerm(text, undefined)).toBe(text);
    });

    it('should return null or undefined when text is null or undefined', () => {
        expect(htmlUtils.highlightSearchTerm(null, 'test')).toBe(null);
        expect(htmlUtils.highlightSearchTerm(undefined, 'test')).toBe(undefined);
    });

    it('should return original text when search term is empty', () => {
        const text = 'This is a test';
        expect(htmlUtils.highlightSearchTerm(text, '')).toBe(text);
        expect(htmlUtils.highlightSearchTerm(text, '   ')).toBe(text);
    });

    it('should highlight a single word in text', () => {
        const text = 'This is a test';
        const expected = 'This is a <mark>test</mark>';
        expect(htmlUtils.highlightSearchTerm(text, 'test')).toBe(expected);
    });

    it('should highlight multiple occurrences of a word', () => {
        const text = 'Test this test and test again';
        const expected = '<mark>Test</mark> this <mark>test</mark> and <mark>test</mark> again';
        expect(htmlUtils.highlightSearchTerm(text, 'test')).toBe(expected);
    });

    it('should highlight multiple search words', () => {
        const text = 'The quick brown fox jumps over the lazy dog';
        const expected = 'The <mark>quick</mark> brown <mark>fox</mark> jumps over the lazy dog';
        expect(htmlUtils.highlightSearchTerm(text, 'quick fox')).toBe(expected);
    });

    it('should escape HTML in the original text', () => {
        const text = '<p>This is a test</p>';
        const expected = '&lt;p&gt;This is a <mark>test</mark>&lt;/p&gt;';
        expect(htmlUtils.highlightSearchTerm(text, 'test')).toBe(expected);
    });

    it('should handle case insensitivity', () => {
        const text = 'This TEST is different from this test';
        const expected = 'This <mark>TEST</mark> is different from this <mark>test</mark>';
        expect(htmlUtils.highlightSearchTerm(text, 'test')).toBe(expected);
    });

    it('should handle special regex characters in search term', () => {
        const text = 'Special characters like * and + need escaping';
        const expected = 'Special characters like <mark>*</mark> and <mark>+</mark> need escaping';
        expect(htmlUtils.highlightSearchTerm(text, '* +')).toBe(expected);
    });

    it('should handle complex HTML with nested elements', () => {
        const text = '<div><p>This is a <strong>test</strong> of HTML</p></div>';
        const expected =
            '&lt;div&gt;&lt;p&gt;This is a &lt;strong&gt;<mark>test</mark>&lt;/strong&gt; of <mark>HTML</mark>&lt;/p&gt;&lt;/div&gt;';
        expect(htmlUtils.highlightSearchTerm(text, 'test HTML')).toBe(expected);
    });

    it('should handle non-string inputs by converting them to strings', () => {
        // @ts-ignore - Testing with number input
        expect(htmlUtils.highlightSearchTerm(123, '2')).toBe('1<mark>2</mark>3');

        // @ts-ignore - Testing with object input
        const obj = { toString: () => 'test object' };
        // @ts-ignore - Testing with object input
        expect(htmlUtils.highlightSearchTerm(obj, 'object')).toBe('test <mark>object</mark>');
    });

    it('should return original text when no search words match', () => {
        const text = 'This is a test';
        const escaped = 'This is a test';
        expect(htmlUtils.highlightSearchTerm(text, 'xyz')).toBe(escaped);
    });
});

describe.concurrent('nl2br', () => {
    it('should return empty string for null or undefined input', () => {
        // @ts-ignore - Testing with null input
        expect(htmlUtils.nl2br(null)).toBe('');
        // @ts-ignore - Testing with undefined input
        expect(htmlUtils.nl2br(undefined)).toBe('');
    });

    it('should convert newlines to <br> tags', () => {
        expect(htmlUtils.nl2br('line1\nline2')).toBe('line1<br>line2');
        expect(htmlUtils.nl2br('line1\r\nline2')).toBe('line1<br>line2');
        expect(htmlUtils.nl2br('line1\rline2')).toBe('line1<br>line2');
    });

    it('should convert tabs to four non-breaking spaces', () => {
        expect(htmlUtils.nl2br('text\tmore')).toBe('text&nbsp;&nbsp;&nbsp;&nbsp;more');
    });

    it('should convert spaces to non-breaking spaces', () => {
        expect(htmlUtils.nl2br('text more')).toBe('text&nbsp;more');
    });

    it('should handle multiple and mixed line breaks, tabs, and spaces', () => {
        expect(htmlUtils.nl2br('line1\n\nline3')).toBe('line1<br><br>line3');
        expect(htmlUtils.nl2br('line1\r\n\r\nline3')).toBe('line1<br><br>line3');
        expect(htmlUtils.nl2br('text\t\tmore')).toBe(
            'text&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;more',
        );
        expect(htmlUtils.nl2br('text  more')).toBe('text&nbsp;&nbsp;more');
        expect(htmlUtils.nl2br('line1\n\tline2')).toBe('line1<br>&nbsp;&nbsp;&nbsp;&nbsp;line2');
    });

    it('should handle non-string inputs by converting them to strings', () => {
        // @ts-ignore - Testing with number input
        expect(htmlUtils.nl2br(123)).toBe('123');

        // @ts-ignore - Testing with object input
        const obj = { toString: () => 'test object' };
        // @ts-ignore - Testing with object input
        expect(htmlUtils.nl2br(obj)).toBe('test&nbsp;object');
    });

    it('should preserve other characters', () => {
        expect(htmlUtils.nl2br('line1\nline2!@#$%^&*()')).toBe('line1<br>line2!@#$%^&*()');
    });
});

describe.concurrent('isOnlyLettersAndNumbers', () => {
    it('should return true for strings with only letters and numbers', () => {
        expect(validationUtils.isOnlyLettersAndNumbers('abc123')).toBe(true);
        expect(validationUtils.isOnlyLettersAndNumbers('ABC123')).toBe(true);
        expect(validationUtils.isOnlyLettersAndNumbers('abcDEF123')).toBe(true);
        expect(validationUtils.isOnlyLettersAndNumbers('123')).toBe(true);
        expect(validationUtils.isOnlyLettersAndNumbers('abc')).toBe(true);
    });

    it('should return false for strings with special characters', () => {
        expect(validationUtils.isOnlyLettersAndNumbers('abc-123')).toBe(false);
        expect(validationUtils.isOnlyLettersAndNumbers('abc_123')).toBe(false);
        expect(validationUtils.isOnlyLettersAndNumbers('abc 123')).toBe(false);
        expect(validationUtils.isOnlyLettersAndNumbers('abc@123')).toBe(false);
        expect(validationUtils.isOnlyLettersAndNumbers('abc.123')).toBe(false);
    });

    it('should return false for empty string', () => {
        expect(validationUtils.isOnlyLettersAndNumbers('')).toBe(false);
    });

    it('should return false for strings with unicode characters', () => {
        expect(validationUtils.isOnlyLettersAndNumbers('abc123ñ')).toBe(false);
        expect(validationUtils.isOnlyLettersAndNumbers('abc123é')).toBe(false);
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
        await utilUtils.insertBookmark({
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
        await utilUtils.insertBookmark({
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
        const result = dateUtils.formatDateInTimezone(utcDate, 'America/Chicago');

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
        const result = dateUtils.formatDateInTimezone(isoDate, 'America/New_York');

        // New York is UTC-5 in winter, so 10:30 UTC = 05:30 (5:30 AM) New York
        expect(result.dateString).toBe('1/15/2025');
        expect(result.timeString).toBe('5:30 AM');
        expect(result.fullString).toBe('1/15/2025, 5:30 AM');
        expect(result.dateInputValue).toBe('2025-01-15');
        expect(result.timeInputValue).toBe('05:30');
    });

    it('should handle Date objects', () => {
        const date = new Date('2025-12-25T18:00:00Z');
        const result = dateUtils.formatDateInTimezone(date, 'Europe/London');

        // London is UTC+0 in winter, so 18:00 UTC = 18:00 (6:00 PM) London
        expect(result.dateString).toBe('12/25/2025');
        expect(result.timeString).toBe('6:00 PM');
        expect(result.fullString).toBe('12/25/2025, 6:00 PM');
        expect(result.dateInputValue).toBe('2025-12-25');
        expect(result.timeInputValue).toBe('18:00');
    });

    it('should default to UTC when no timezone is provided', () => {
        const utcDate = '2025-06-15 09:15:00';
        const result = dateUtils.formatDateInTimezone(utcDate);

        expect(result.dateString).toBe('6/15/2025');
        expect(result.timeString).toBe('9:15 AM');
        expect(result.fullString).toBe('6/15/2025, 9:15 AM');
        expect(result.dateInputValue).toBe('2025-06-15');
        expect(result.timeInputValue).toBe('09:15');
    });

    it('should handle midnight correctly', () => {
        const midnightUTC = '2025-03-01T00:00:00Z';
        const result = dateUtils.formatDateInTimezone(midnightUTC, 'America/Los_Angeles');

        // LA is UTC-8 in winter, so midnight UTC = 4:00 PM previous day in LA
        expect(result.dateString).toBe('2/28/2025');
        expect(result.timeString).toBe('4:00 PM');
        expect(result.dateInputValue).toBe('2025-02-28');
        expect(result.timeInputValue).toBe('16:00');
    });

    it('should handle noon correctly', () => {
        const noonUTC = '2025-07-15T12:00:00Z';
        const result = dateUtils.formatDateInTimezone(noonUTC, 'Asia/Tokyo');

        // Tokyo is UTC+9, so noon UTC = 9:00 PM Tokyo
        expect(result.dateString).toBe('7/15/2025');
        expect(result.timeString).toBe('9:00 PM');
        expect(result.dateInputValue).toBe('2025-07-15');
        expect(result.timeInputValue).toBe('21:00');
    });

    it('should handle invalid date gracefully with fallback', () => {
        const invalidDate = 'invalid-date';
        const result = dateUtils.formatDateInTimezone(invalidDate, 'America/Chicago');

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
        const result1 = dateUtils.formatDateInTimezone(earlyMorning, 'America/New_York');

        // NYC is UTC-4 in April, so 6:05 UTC = 2:05 AM NYC
        expect(result1.timeString).toBe('2:05 AM');
        expect(result1.timeInputValue).toBe('02:05');

        // Test 9:30 AM
        const morning = '2025-04-10T13:30:00Z';
        const result2 = dateUtils.formatDateInTimezone(morning, 'America/New_York');

        // 13:30 UTC = 9:30 AM NYC
        expect(result2.timeString).toBe('9:30 AM');
        expect(result2.timeInputValue).toBe('09:30');
    });
});

describe('sendReminderDigestEmail', () => {
    let sendMailMock: ReturnType<typeof vi.fn>;
    let testMailUtils: ReturnType<typeof MailUtils>;

    beforeAll(async () => {
        const { SettingsRepository } = await import('../routes/admin/settings.repository');

        sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test-id' });

        const mockNodemailer = {
            createTransport: vi.fn().mockReturnValue({ sendMail: sendMailMock }),
        };

        const prodConfig = {
            ...config,
            app: { ...config.app, env: 'production' },
        };

        const testContext = {
            db,
            config: prodConfig,
            libs: { ...libs, nodemailer: mockNodemailer },
            logger: { error: vi.fn(), info: vi.fn() },
            models: { settings: SettingsRepository({ db, config, libs } as any) },
        } as any;

        testMailUtils = MailUtils(testContext);
    });

    beforeEach(() => {
        sendMailMock.mockClear();
    });

    it('should not send email when reminders array is empty', async () => {
        await testMailUtils.sendReminderDigestEmail({
            email: 'test@example.com',
            username: 'TestUser',
            reminders: [],
            date: '2025-08-16',
        });

        expect(sendMailMock).not.toHaveBeenCalled();
    });

    it('should send email with clickable links in HTML', async () => {
        const reminders = [
            {
                id: 1,
                title: 'AI Agent Best Practices',
                url: 'https://forgecode.dev/blog/ai-agent-best-practices/',
                reminder_type: 'recurring' as const,
                frequency: 'weekly' as const,
            },
            {
                id: 2,
                title: 'Meeting with team',
                reminder_type: 'once' as const,
            },
        ];

        await testMailUtils.sendReminderDigestEmail({
            email: 'test@example.com',
            username: 'TestUser',
            reminders,
            date: '2025-08-16',
        });

        expect(sendMailMock).toHaveBeenCalledTimes(1);
        const emailArgs = sendMailMock.mock.calls[0][0];

        expect(emailArgs.to).toBe('test@example.com');
        expect(emailArgs.subject).toContain('Reminders');
        expect(emailArgs.subject).toContain('Saturday, August 16, 2025');
        expect(emailArgs.html).toContain('Hello TestUser');
        expect(emailArgs.html).toContain(
            '<a href="https://forgecode.dev/blog/ai-agent-best-practices/">AI Agent Best Practices</a>',
        );
        expect(emailArgs.html).toContain('<li>Meeting with team</li>');
    });

    it('should show "weekly reminders" when all reminders are weekly recurring', async () => {
        const reminders = [
            {
                id: 1,
                title: 'Weekly Report',
                reminder_type: 'recurring' as const,
                frequency: 'weekly' as const,
            },
            {
                id: 2,
                title: 'Weekly Review',
                reminder_type: 'recurring' as const,
                frequency: 'weekly' as const,
            },
        ];

        await testMailUtils.sendReminderDigestEmail({
            email: 'test@example.com',
            username: 'TestUser',
            reminders,
            date: '2025-08-16',
        });

        const emailArgs = sendMailMock.mock.calls[0][0];
        expect(emailArgs.html).toContain('weekly reminders');
    });

    it('should show "reminders" when reminder types are mixed', async () => {
        const reminders = [
            {
                id: 1,
                title: 'Daily standup',
                reminder_type: 'recurring' as const,
                frequency: 'daily' as const,
            },
            {
                id: 2,
                title: 'Doctor appointment',
                reminder_type: 'once' as const,
            },
            {
                id: 3,
                title: 'Weekly review',
                reminder_type: 'recurring' as const,
                frequency: 'weekly' as const,
            },
        ];

        await testMailUtils.sendReminderDigestEmail({
            email: 'test@example.com',
            username: 'TestUser',
            reminders,
            date: '2025-08-16',
        });

        const emailArgs = sendMailMock.mock.calls[0][0];
        expect(emailArgs.html).toContain('your reminders for');
        expect(emailArgs.html).not.toContain('weekly reminders');
        expect(emailArgs.html).not.toContain('daily reminders');
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
        vi.spyOn(mailUtils, 'sendReminderDigestEmail').mockResolvedValue();
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('should find due reminders in the next 15 minutes and handle timezone correctly', async () => {
        const now = libs.dayjs.utc();
        const in10Minutes = now.add(10, 'minute');
        const in20Minutes = now.add(20, 'minute');
        const past20Minutes = now.subtract(20, 'minute');

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
                due_date: past20Minutes.toISOString(),
            },
        ]);

        await mailUtils.processReminderDigests();

        const remainingReminders = await db('reminders').where('title', 'Due Soon');
        expect(remainingReminders).toHaveLength(0);

        const futureReminders = await db('reminders').where('title', 'Due Later');
        expect(futureReminders).toHaveLength(1);

        const pastDueReminders = await db('reminders').where('title', 'Already Due');
        expect(pastDueReminders).toHaveLength(1);
    });

    it('should handle recurring reminders and calculate next due date correctly', async () => {
        const now = libs.dayjs.utc();
        const in5Minutes = now.add(5, 'minute');

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

        await mailUtils.processReminderDigests();

        const dailyReminder = await db('reminders').where('title', 'Daily Reminder').first();
        const weeklyReminder = await db('reminders').where('title', 'Weekly Reminder').first();

        expect(dailyReminder).toBeTruthy();
        expect(weeklyReminder).toBeTruthy();

        const originalDue = in5Minutes.toDate();
        const dailyNextDue = new Date(dailyReminder.due_date);
        const weeklyNextDue = new Date(weeklyReminder.due_date);

        expect(dailyNextDue.getTime() - originalDue.getTime()).toBeCloseTo(24 * 60 * 60 * 1000, -4);

        const weeklyDue = libs.dayjs.tz(weeklyReminder.due_date, 'UTC').tz('America/Chicago');
        expect(weeklyDue.day()).toBe(6);

        const weeklyDiff = weeklyNextDue.getTime() - originalDue.getTime();
        expect(weeklyDiff).toBeGreaterThan(0);
        expect(weeklyDiff).toBeLessThanOrEqual(14 * 24 * 60 * 60 * 1000);
    });

    it('should handle no due reminders gracefully', async () => {
        const farFuture = new Date(Date.now() + 2 * 60 * 60 * 1000);

        await db('reminders').insert({
            user_id: testUserId,
            title: 'Far Future',
            reminder_type: 'once',
            due_date: farFuture.toISOString(),
        });

        await expect(mailUtils.processReminderDigests()).resolves.not.toThrow();

        const reminders = await db('reminders').where('title', 'Far Future');
        expect(reminders).toHaveLength(1);
    });

    it('should use UTC for database queries and handle user timezones for email formatting', async () => {
        const now = libs.dayjs.utc();
        const in5Minutes = now.add(5, 'minute');

        await db('reminders').insert({
            user_id: testUserId,
            title: 'UTC Test',
            reminder_type: 'once',
            due_date: in5Minutes.toISOString(),
        });

        await mailUtils.processReminderDigests();

        const remainingReminders = await db('reminders').where('title', 'UTC Test');
        expect(remainingReminders).toHaveLength(0);
    });

    it('should schedule weekly reminders for Saturday and monthly for the 1st', async () => {
        const now = libs.dayjs.utc();
        const in5Minutes = now.add(5, 'minute');

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

        await mailUtils.processReminderDigests();

        const weeklyReminder = await db('reminders').where('title', 'Weekly Report').first();
        const monthlyReminder = await db('reminders').where('title', 'Monthly Review').first();

        expect(weeklyReminder).toBeTruthy();
        expect(monthlyReminder).toBeTruthy();

        const weeklyDue = libs.dayjs.tz(weeklyReminder.due_date, 'UTC').tz('America/Chicago');
        expect(weeklyDue.day()).toBe(6);

        const monthlyDue = libs.dayjs.tz(monthlyReminder.due_date, 'UTC').tz('America/Chicago');
        expect(monthlyDue.date()).toBe(1);
    });

    it('should allow daily reminders to be processed multiple times', async () => {
        const now = libs.dayjs.utc();
        const in5Minutes = now.add(5, 'minute');

        await db('reminders').insert({
            user_id: testUserId,
            title: 'Multi-Day Daily Reminder',
            reminder_type: 'recurring',
            frequency: 'daily',
            due_date: in5Minutes.toISOString(),
        });

        await mailUtils.processReminderDigests();

        let reminder = await db('reminders').where('title', 'Multi-Day Daily Reminder').first();
        expect(reminder).toBeTruthy();

        const firstDue = new Date(reminder.due_date);
        expect(firstDue.getTime()).toBeGreaterThan(in5Minutes.toDate().getTime());

        const nowAgain = libs.dayjs.utc();
        const in5MinutesAgain = nowAgain.add(5, 'minute');

        await db('reminders')
            .where('title', 'Multi-Day Daily Reminder')
            .update({ due_date: in5MinutesAgain.toISOString() });

        await mailUtils.processReminderDigests();

        reminder = await db('reminders').where('title', 'Multi-Day Daily Reminder').first();
        expect(reminder).toBeTruthy();

        const updatedDue = new Date(reminder.due_date);
        expect(updatedDue.getTime() - in5MinutesAgain.toDate().getTime()).toBeCloseTo(
            24 * 60 * 60 * 1000,
            -4,
        );
    });
});
