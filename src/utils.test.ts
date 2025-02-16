import { BookmarkToExport } from 'types';
import { describe, expect, it } from 'vitest';
import { bookmark, isValidUrl, addHttps, fetchPageTitle } from './utils';

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
