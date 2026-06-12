import { createHtml } from './html.js';
import { describe, expect, it } from 'vite-plus/test';

const htmlUtils = createHtml();

describe('HtmlUtils', () => {
    describe('escapeHtml', () => {
        it('should escape HTML special characters', () => {
            expect(htmlUtils.escapeHtml('<script>alert("xss")</script>')).toBe(
                '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
            );
        });

        it('should escape ampersands', () => {
            expect(htmlUtils.escapeHtml('foo & bar')).toBe('foo &amp; bar');
        });

        it('should escape single quotes', () => {
            expect(htmlUtils.escapeHtml("it's")).toBe('it&#39;s');
        });
    });

    describe('highlightSearchTerm', () => {
        it('should highlight matching terms', () => {
            const result = htmlUtils.highlightSearchTerm('Hello World', 'world');
            expect(result).toBe('Hello <mark>World</mark>');
        });

        it('should highlight multiple matching terms', () => {
            const result = htmlUtils.highlightSearchTerm('Hello World Wide Web', 'world web');
            expect(result).toBe('Hello <mark>World</mark> Wide <mark>Web</mark>');
        });

        it('should be case insensitive', () => {
            const result = htmlUtils.highlightSearchTerm('HELLO world', 'hello');
            expect(result).toContain('<mark>');
            expect(result).toContain('HELLO');
            expect(result).toContain('world');
        });

        it('should return original text when no search term', () => {
            expect(htmlUtils.highlightSearchTerm('Hello World', '')).toBe('Hello World');
            expect(htmlUtils.highlightSearchTerm('Hello World', null)).toBe('Hello World');
        });

        it('should escape HTML in original text', () => {
            const result = htmlUtils.highlightSearchTerm('<script>test</script>', 'test');
            expect(result).toBe('&lt;script&gt;<mark>test</mark>&lt;/script&gt;');
        });

        it('should highlight a search for an HTML-special char without splitting entities', () => {
            // Searching '&' over 'A & B' must mark the whole &amp; entity, not the bare &.
            expect(htmlUtils.highlightSearchTerm('A & B', '&')).toBe('A <mark>&amp;</mark> B');
        });

        it('should HTML-escape even when there is no search term (stored-XSS guard)', () => {
            // The list templates render this output raw (<%~), so it must be escaped on the
            // no-search path too — a regression to returning raw text would re-open stored XSS.
            expect(htmlUtils.highlightSearchTerm('<img src=x onerror=alert(1)>', '')).toBe(
                '&lt;img src=x onerror=alert(1)&gt;',
            );
            expect(htmlUtils.highlightSearchTerm('Tom & "Jerry"', undefined)).toBe(
                'Tom &amp; &quot;Jerry&quot;',
            );
        });
    });

    describe('safeHref', () => {
        it('should pass through http(s) URLs unchanged', () => {
            expect(htmlUtils.safeHref('https://example.com/a?b=1&c=2')).toBe(
                'https://example.com/a?b=1&c=2',
            );
            expect(htmlUtils.safeHref('http://example.com')).toBe('http://example.com');
        });

        it('should allow same-origin relative paths', () => {
            expect(htmlUtils.safeHref('/bookmarks?id=1')).toBe('/bookmarks?id=1');
        });

        it('should neutralize dangerous schemes', () => {
            expect(htmlUtils.safeHref('javascript:alert(1)')).toBe('#');
            expect(htmlUtils.safeHref('JavaScript:alert(1)')).toBe('#');
            expect(htmlUtils.safeHref('data:text/html,<script>1</script>')).toBe('#');
            expect(htmlUtils.safeHref('vbscript:msgbox(1)')).toBe('#');
        });

        it('should reject protocol-relative and backslash-normalized URLs', () => {
            expect(htmlUtils.safeHref('//evil.com')).toBe('#');
            expect(htmlUtils.safeHref('/\\evil.com')).toBe('#');
            expect(htmlUtils.safeHref('\\\\evil.com')).toBe('#');
            expect(htmlUtils.safeHref('/\\/evil.com')).toBe('#');
        });

        it('should return # for empty/nullish input', () => {
            expect(htmlUtils.safeHref('')).toBe('#');
            expect(htmlUtils.safeHref(null)).toBe('#');
            expect(htmlUtils.safeHref(undefined)).toBe('#');
        });
    });

    describe('safeJsonForScript', () => {
        it('should escape characters that could break out of a <script> tag', () => {
            const out = htmlUtils.safeJsonForScript({ x: '</script><img src=x onerror=alert(1)>' });
            expect(out).not.toContain('</script>');
            expect(out).not.toContain('<img');
            expect(out).toContain('\\u003c');
        });

        it('should round-trip back to the original value via JSON.parse', () => {
            const value = { url: 'https://x.com?a=1&b=2', note: '</script> & <b>hi</b>' };
            expect(JSON.parse(htmlUtils.safeJsonForScript(value))).toEqual(value);
        });

        it('should serialize nullish input as null', () => {
            expect(htmlUtils.safeJsonForScript(undefined)).toBe('null');
            expect(htmlUtils.safeJsonForScript(null)).toBe('null');
        });
    });

    describe('applyHighlighting', () => {
        it('should apply highlighting to specified fields', () => {
            const items = [
                { title: 'Hello World', url: 'https://world.com', id: 1 },
                { title: 'Goodbye Moon', url: 'https://moon.com', id: 2 },
            ];

            htmlUtils.applyHighlighting(items, ['title', 'url'], 'world');

            expect(items[0].title).toBe('Hello <mark>World</mark>');
            expect(items[0].url).toBe('https://<mark>world</mark>.com');
            expect(items[0].id).toBe(1); // Non-highlighted field unchanged
            expect(items[1].title).toBe('Goodbye Moon');
            expect(items[1].url).toBe('https://moon.com');
        });

        it('should handle empty arrays', () => {
            const items: any[] = [];
            const result = htmlUtils.applyHighlighting(items, ['title'], 'test');
            expect(result).toEqual([]);
        });

        it('should handle null/undefined search term', () => {
            const items = [{ title: 'Hello', url: 'https://test.com' }];
            htmlUtils.applyHighlighting(items, ['title', 'url'], null);
            expect(items[0].title).toBe('Hello');
            expect(items[0].url).toBe('https://test.com');
        });

        it('should handle null field values', () => {
            const items = [{ title: null, url: 'https://test.com' }];
            htmlUtils.applyHighlighting(items, ['title', 'url'], 'test');
            expect(items[0].title).toBeNull();
            expect(items[0].url).toBe('https://<mark>test</mark>.com');
        });

        it('should mutate items in place and return them', () => {
            const items = [{ title: 'Test Item' }];
            const result = htmlUtils.applyHighlighting(items, ['title'], 'test');
            expect(result).toBe(items); // Same reference
            expect(items[0].title).toBe('<mark>Test</mark> Item');
        });
    });

    describe('stripHtmlTags', () => {
        it('should remove HTML tags', () => {
            expect(htmlUtils.stripHtmlTags('<p>Hello <b>World</b></p>')).toBe('Hello World');
        });

        it('should normalize whitespace', () => {
            expect(htmlUtils.stripHtmlTags('Hello    World')).toBe('Hello World');
        });

        it('should handle null/undefined', () => {
            expect(htmlUtils.stripHtmlTags(null)).toBe('');
            expect(htmlUtils.stripHtmlTags(undefined)).toBe('');
        });
    });

    describe('decodeHtmlEntities', () => {
        it('should decode common HTML entities', () => {
            expect(htmlUtils.decodeHtmlEntities('&lt;test&gt;')).toBe('<test>');
            expect(htmlUtils.decodeHtmlEntities('&amp;')).toBe('&');
            expect(htmlUtils.decodeHtmlEntities('hello&nbsp;world')).toBe('hello world');
        });

        it('should strip HTML tags', () => {
            expect(htmlUtils.decodeHtmlEntities('<p>Hello</p>')).toBe('Hello');
        });
    });
});
