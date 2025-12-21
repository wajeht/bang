import { HtmlUtils } from './html';
import { describe, expect, it } from 'vitest';

const htmlUtils = HtmlUtils();

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

    describe('nl2br', () => {
        it('should convert newlines to br tags', () => {
            expect(htmlUtils.nl2br('Hello\nWorld')).toBe('Hello<br>World');
        });

        it('should convert tabs to spaces', () => {
            expect(htmlUtils.nl2br('Hello\tWorld')).toBe('Hello&nbsp;&nbsp;&nbsp;&nbsp;World');
        });

        it('should convert spaces to nbsp', () => {
            expect(htmlUtils.nl2br('Hello World')).toBe('Hello&nbsp;World');
        });

        it('should handle empty strings', () => {
            expect(htmlUtils.nl2br('')).toBe('');
            expect(htmlUtils.nl2br(null as any)).toBe('');
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
