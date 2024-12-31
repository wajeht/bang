import { BookmarkToExport } from 'types';
import { bookmark, isValidUrl } from './utils';
import { describe, expect, it } from 'vitest';

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
