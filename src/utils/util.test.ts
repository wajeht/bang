import path from 'node:path';
import { createUtil } from './util.js';
import { libs } from '../libs.js';
import fs from 'node:fs/promises';
import { config } from '../config.js';
import { createAuth } from './auth.js';
import { createHtml } from './html.js';
import { createDate } from './date.js';
import { createRequest } from './request.js';
import { db } from '../tests/test-setup.js';
import { createValidation } from './validation.js';
import type { HonoContext, BookmarkToExport } from '../type.js';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

let validationUtils: ReturnType<typeof createValidation>;
let authUtils: ReturnType<typeof createAuth>;
let utilUtils: ReturnType<typeof createUtil>;
let htmlUtils: ReturnType<typeof createHtml>;
let dateUtils: ReturnType<typeof createDate>;
let requestUtils: ReturnType<typeof createRequest>;

function createTestContext({
    query,
    user,
}: {
    query: Record<string, string | undefined>;
    user: Record<string, any>;
}): HonoContext {
    return {
        req: {
            query: () => query,
        },
        get: (key: string) => {
            if (key === 'user') return user;
            return undefined;
        },
    } as unknown as HonoContext;
}

beforeAll(async () => {
    const { createBookmarksRepository } = await import('../routes/bookmarks/bookmarks.repository');
    const { createSettingsRepository } = await import('../routes/admin/settings.repository');

    const mockContext = {
        db,
        config,
        libs,
        logger: { error: vi.fn(), info: vi.fn(), tag: vi.fn().mockReturnThis() },
        utils: {} as any,
        models: {} as any,
        errors: {} as any,
    } as any;

    validationUtils = createValidation();
    authUtils = createAuth(mockContext);
    htmlUtils = createHtml();
    dateUtils = createDate(mockContext);
    requestUtils = createRequest(mockContext);

    mockContext.utils = {
        validation: validationUtils,
        auth: authUtils,
        html: htmlUtils,
        date: dateUtils,
        request: requestUtils,
    };

    mockContext.models = {
        bookmarks: createBookmarksRepository(mockContext),
        settings: createSettingsRepository(mockContext),
    };

    utilUtils = createUtil(mockContext);

    mockContext.utils.util = utilUtils;
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

describe.concurrent('getFaviconUrl', () => {
    it('should extract hostname from valid https URL', () => {
        expect(utilUtils.getFaviconUrl('https://example.com/path/to/page')).toBe(
            'https://favicon.jaw.dev/?url=example.com',
        );
    });

    it('should extract hostname from valid http URL', () => {
        expect(utilUtils.getFaviconUrl('http://example.com')).toBe(
            'https://favicon.jaw.dev/?url=example.com',
        );
    });

    it('should handle URL with subdomain', () => {
        expect(utilUtils.getFaviconUrl('https://www.example.com')).toBe(
            'https://favicon.jaw.dev/?url=www.example.com',
        );
    });

    it('should handle URL with port', () => {
        expect(utilUtils.getFaviconUrl('https://example.com:8080/path')).toBe(
            'https://favicon.jaw.dev/?url=example.com',
        );
    });

    it('should normalize and extract hostname when URL has no protocol', () => {
        expect(utilUtils.getFaviconUrl('example.com')).toBe(
            'https://favicon.jaw.dev/?url=example.com',
        );
    });

    it('should normalize and extract hostname for www URLs', () => {
        expect(utilUtils.getFaviconUrl('www.example.com')).toBe(
            'https://favicon.jaw.dev/?url=www.example.com',
        );
    });

    it('should handle empty string', () => {
        expect(utilUtils.getFaviconUrl('')).toBe('https://favicon.jaw.dev/?url=');
    });
});

describe.concurrent('getScreenshotUrl', () => {
    it('should encode valid https URL', () => {
        expect(utilUtils.getScreenshotUrl('https://example.com')).toBe(
            'https://screenshot.jaw.dev?url=https%3A%2F%2Fexample.com',
        );
    });

    it('should encode valid http URL', () => {
        expect(utilUtils.getScreenshotUrl('http://example.com')).toBe(
            'https://screenshot.jaw.dev?url=http%3A%2F%2Fexample.com',
        );
    });

    it('should encode URL with path and query params', () => {
        expect(utilUtils.getScreenshotUrl('https://example.com/path?foo=bar')).toBe(
            'https://screenshot.jaw.dev?url=https%3A%2F%2Fexample.com%2Fpath%3Ffoo%3Dbar',
        );
    });

    it('should prepend https:// when URL has no protocol', () => {
        expect(utilUtils.getScreenshotUrl('example.com')).toBe(
            'https://screenshot.jaw.dev?url=https%3A%2F%2Fexample.com',
        );
    });

    it('should prepend https:// for www URLs without protocol', () => {
        expect(utilUtils.getScreenshotUrl('www.example.com')).toBe(
            'https://screenshot.jaw.dev?url=https%3A%2F%2Fwww.example.com',
        );
    });

    it('should not double-prepend for URLs starting with http', () => {
        expect(utilUtils.getScreenshotUrl('http://example.com')).toBe(
            'https://screenshot.jaw.dev?url=http%3A%2F%2Fexample.com',
        );
    });

    it('should handle empty string by falling back to original', () => {
        expect(utilUtils.getScreenshotUrl('')).toBe('https://screenshot.jaw.dev?url=');
    });

    it('should encode special characters in URL', () => {
        expect(utilUtils.getScreenshotUrl('https://example.com/path with spaces')).toBe(
            'https://screenshot.jaw.dev?url=https%3A%2F%2Fexample.com%2Fpath%20with%20spaces',
        );
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
        };

        const pagination = requestUtils.extractPaginationParamsFromContext(
            createTestContext(req),
            'bookmarks',
        );
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
        };

        const pagination = requestUtils.extractPaginationParamsFromContext(
            createTestContext(req),
            'bookmarks',
        );
        expect(pagination).toEqual({
            perPage: 5,
            page: 1,
            search: '',
            sortKey: 'created_at',
            direction: 'desc',
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

    it('should call prefetchAssets when bookmark is inserted', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
            text: () => Promise.resolve(''),
        } as unknown as globalThis.Response);

        await utilUtils.insertBookmark({
            url: 'https://prefetch-test.com',
            userId: 1,
            title: 'Prefetch Test',
        });

        await vi.waitFor(() => {
            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('screenshot.jaw.dev'),
                expect.any(Object),
            );
        });

        await vi.waitFor(() => {
            expect(fetchSpy).toHaveBeenCalledWith(
                expect.stringContaining('favicon.jaw.dev'),
                expect.any(Object),
            );
        });

        fetchSpy.mockRestore();
    });
});

describe('prefetchScreenshots', () => {
    it('should prefetch screenshots in batches', async () => {
        const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue({
            text: () => Promise.resolve(''),
        } as unknown as globalThis.Response);

        await utilUtils.prefetchScreenshots(['https://example.com', 'example.org'], {
            userAgent: 'Bang test',
        });

        expect(fetchSpy).toHaveBeenCalledTimes(2);
        expect(fetchSpy).toHaveBeenCalledWith(
            'https://screenshot.jaw.dev?url=https%3A%2F%2Fexample.com',
            expect.objectContaining({
                method: 'HEAD',
                headers: { 'User-Agent': 'Bang test' },
            }),
        );
        expect(fetchSpy).toHaveBeenCalledWith(
            'https://screenshot.jaw.dev?url=https%3A%2F%2Fexample.org',
            expect.objectContaining({
                method: 'HEAD',
                headers: { 'User-Agent': 'Bang test' },
            }),
        );

        fetchSpy.mockRestore();
    });
});

describe('checkDuplicateBookmarkUrl', () => {
    beforeEach(async () => {
        await db('bookmarks').insert({
            user_id: 1,
            url: 'https://example.com',
            title: 'Original Title',
        });
    });

    it('should find duplicate when URL matches and no title is provided', async () => {
        const result = await utilUtils.checkDuplicateBookmarkUrl(1, 'https://example.com');
        expect(result).not.toBeNull();
        expect(result?.url).toBe('https://example.com');
        expect(result?.title).toBe('Original Title');
    });

    it('should find duplicate when URL matches and empty title is provided', async () => {
        const result = await utilUtils.checkDuplicateBookmarkUrl(1, 'https://example.com', '');
        expect(result).not.toBeNull();
        expect(result?.url).toBe('https://example.com');
    });

    it('should find duplicate when both URL and title match', async () => {
        const result = await utilUtils.checkDuplicateBookmarkUrl(
            1,
            'https://example.com',
            'Original Title',
        );
        expect(result).not.toBeNull();
        expect(result?.url).toBe('https://example.com');
        expect(result?.title).toBe('Original Title');
    });

    it('should NOT find duplicate when URL matches but title is different', async () => {
        const result = await utilUtils.checkDuplicateBookmarkUrl(
            1,
            'https://example.com',
            'Different Title',
        );
        expect(result).toBeFalsy();
    });

    it('should NOT find duplicate when URL does not exist', async () => {
        const result = await utilUtils.checkDuplicateBookmarkUrl(1, 'https://nonexistent.com');
        expect(result).toBeFalsy();
    });

    it('should NOT find duplicate for different user', async () => {
        const result = await utilUtils.checkDuplicateBookmarkUrl(999, 'https://example.com');
        expect(result).toBeFalsy();
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

describe('convertMarkdownToPlainText (hoisted Marked instance)', () => {
    it('should return empty string for empty/whitespace input', async () => {
        expect(await utilUtils.convertMarkdownToPlainText('')).toBe('');
        expect(await utilUtils.convertMarkdownToPlainText('   ')).toBe('');
        expect(await utilUtils.convertMarkdownToPlainText(null as any)).toBe('');
        expect(await utilUtils.convertMarkdownToPlainText(undefined as any)).toBe('');
    });

    it('should strip markdown syntax and HTML tags', async () => {
        const out = await utilUtils.convertMarkdownToPlainText(
            '# Title\n\n**bold** and _italic_ with [link](https://x.com).',
        );
        expect(out).toContain('Title');
        expect(out).toContain('bold');
        expect(out).toContain('italic');
        expect(out).toContain('link');
        expect(out).not.toContain('**');
        expect(out).not.toContain('<p>');
        expect(out).not.toContain('<a');
    });

    it('should preserve <mark> tags (they are excluded from the strip regex)', async () => {
        const out = await utilUtils.convertMarkdownToPlainText('hello <mark>world</mark>');
        expect(out).toContain('<mark>world</mark>');
    });

    it('should truncate when maxLength is provided', async () => {
        const long = 'a '.repeat(500);
        const out = await utilUtils.convertMarkdownToPlainText(long, 50);
        expect(out.length).toBeLessThanOrEqual(53); // 50 + '...'
        expect(out.endsWith('...')).toBe(true);
    });

    it('should NOT truncate when text is shorter than maxLength', async () => {
        const out = await utilUtils.convertMarkdownToPlainText('short text', 100);
        expect(out).toBe('short text');
        expect(out.endsWith('...')).toBe(false);
    });

    it('should produce identical output across many sequential calls (no global-state race)', async () => {
        // The fix replaces a global `marked.setOptions()` mutation with a per-instance
        // `new Marked({...})`. If the old global-mutation pattern were used, concurrent
        // callers with different options could see each other's settings. Run many calls
        // and assert all produce the same well-defined output.
        const md = '**bold** *italic*';
        const results = await Promise.all(
            Array.from({ length: 50 }, () => utilUtils.convertMarkdownToPlainText(md)),
        );
        const unique = new Set(results);
        expect(unique.size).toBe(1);
        expect([...unique][0]).toBe('bold italic');
    });
});
