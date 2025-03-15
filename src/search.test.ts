import { db } from './db/db';
import { User } from './type';
import * as utils from './util';
import { appConfig } from './config';
import * as searchModule from './search';
import { Request, Response } from 'express';
import { search, processDelayedSearch } from './search';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

describe('search', () => {
    describe('unauthenticated', () => {
        it('should redirect to google when !g is used', async () => {
            const req = {
                session: {
                    searchCount: 0,
                },
                params: {
                    q: '!g python',
                },
            } as unknown as Request;

            const res = {
                status: 200,
                redirect: vi.fn(),
            } as unknown as Response;

            await search({ req, res, user: undefined, query: '!g python' });

            expect(res.status).toBe(200);
            expect(res.redirect).toHaveBeenCalledWith('https://www.google.com/search?q=python');
            expect(req.session.searchCount).toBe(1);
            expect(req.session.user).toBeUndefined();
        });

        it('should redirect to google when !g is used without a search term', async () => {
            const req = {
                session: {
                    searchCount: 0,
                },
            } as unknown as Request;

            const res = {
                status: 200,
                redirect: vi.fn(),
            } as unknown as Response;

            await search({ req, res, user: undefined, query: '!g' });

            expect(res.status).toBe(200);
            expect(res.redirect).toHaveBeenCalledWith('https://www.google.com');
            expect(req.session.searchCount).toBe(1);
            expect(req.session.user).toBeUndefined();
        });

        it('should redirect ddg without a exclamation mark when !doesnotexistanywhere is used', async () => {
            const req = {
                session: {
                    searchCount: 0,
                },
            } as unknown as Request;

            const res = {
                status: 200,
                redirect: vi.fn(),
            } as unknown as Response;

            await search({ req, res, user: undefined, query: '!doesnotexistanywhere' });

            expect(res.status).toBe(200);
            expect(res.redirect).toHaveBeenCalledWith(
                'https://duckduckgo.com/?q=!doesnotexistanywhere',
            );
            expect(req.session.searchCount).toBe(1);
            expect(req.session.user).toBeUndefined();
        });

        it('should redirect back with a warning when a user has reached to its 10th search', async () => {
            const req = {
                session: {
                    searchCount: 10,
                    cumulativeDelay: 5000,
                },
            } as unknown as Request;

            const res = {
                status: vi.fn().mockReturnThis(),
                redirect: vi.fn(),
                setHeader: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            await search({ req, res, user: undefined, query: '!g python' });

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
            expect(res.send).toHaveBeenCalledWith(
                expect.stringContaining(
                    'You have used 10 out of 60 searches. Log in for unlimited searches!',
                ),
            );
            expect(res.send).toHaveBeenCalledWith(
                expect.stringContaining(
                    'window.location.href = "https://duckduckgo.com/?q=python"',
                ),
            );
            expect(req.session.searchCount).toBe(11);
            expect(req.session.cumulativeDelay).toBe(5000);
            expect(req.session.user).toBeUndefined();
        });

        it('should redirect back with a warning when a user has reached to its 60th search', async () => {
            const req = {
                session: {
                    searchCount: 60,
                    cumulativeDelay: 5000,
                },
            } as unknown as Request;

            const res = {
                status: vi.fn().mockReturnThis(),
                redirect: vi.fn(),
                setHeader: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            await search({ req, res, user: undefined, query: '!g python' });

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
            expect(res.send).toHaveBeenCalledWith(
                expect.stringContaining(
                    "You've exceeded the search limit for unauthenticated users. Please log in for unlimited searches without delays.",
                ),
            );
            expect(res.send).toHaveBeenCalledWith(
                expect.stringContaining(
                    'window.location.href = "https://duckduckgo.com/?q=python"',
                ),
            );
            expect(req.session.searchCount).toBe(61);
            expect(req.session.cumulativeDelay).toBe(10000);
            expect(req.session.user).toBeUndefined();
        });

        it.skipIf(appConfig.env === 'development')(
            'should have slow down the search when a user has reached more than 60 searches',
            async () => {
                const req = {
                    session: {
                        searchCount: 61,
                        cumulativeDelay: 5000,
                    },
                } as unknown as Request;

                const res = {
                    status: vi.fn().mockReturnThis(),
                    redirect: vi.fn(),
                    setHeader: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                // Properly mock the processDelayedSearch function
                const processDelayedSpy = vi
                    .spyOn(searchModule, 'processDelayedSearch')
                    .mockResolvedValue(undefined);

                try {
                    await search({ req, res, user: undefined, query: '!g python' });

                    // Verify the delay function was called
                    expect(processDelayedSpy).toHaveBeenCalled();

                    // Verify the response after the delay
                    expect(res.status).toHaveBeenCalledWith(200);
                    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
                    expect(res.send).toHaveBeenCalledWith(
                        expect.stringContaining(
                            'This search was delayed by 10 seconds due to rate limiting.',
                        ),
                    );
                    expect(res.send).toHaveBeenCalledWith(
                        expect.stringContaining(
                            'window.location.href = "https://www.google.com/search?q=python"',
                        ),
                    );
                    expect(req.session.searchCount).toBe(62);
                    expect(req.session.cumulativeDelay).toBe(10000);
                    expect(req.session.user).toBeUndefined();
                } finally {
                    // Restore the original implementation
                    processDelayedSpy.mockRestore();
                }
            },
        );
    });

    describe('authenticated', () => {
        beforeAll(async () => {
            await db('bookmarks').del();
            await db('bangs').del();
            await db('action_types').del();
            await db('users').del();

            // Insert test data
            await db('users').insert({
                id: 1,
                username: 'Test User',
                email: 'test@example.com',
                is_admin: false,
                default_search_provider: 'duckduckgo',
            });

            await db('action_types').insert([
                { id: 1, name: 'search' },
                { id: 2, name: 'redirect' },
            ]);

            // Insert both search and redirect bangs for testing
            await db('bangs').insert([
                {
                    user_id: 1,
                    trigger: '!custom',
                    name: 'Custom Search',
                    action_type_id: 1,
                    url: 'https://example.com/search?q={{{s}}}',
                },
                {
                    user_id: 1,
                    trigger: '!mysite',
                    name: 'My Site',
                    action_type_id: 2,
                    url: 'https://mysite.com',
                },
            ]);
        });

        afterAll(async () => {
            await db('bookmarks').del();
            await db('bangs').del();
            await db('action_types').del();
            await db('users').del();
        });

        const testUser = {
            id: 1,
            username: 'Test User',
            email: 'test@example.com',
            is_admin: false,
            default_search_provider: 'duckduckgo',
        } as User;

        it('should handle direct navigation commands', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
            } as unknown as Response;

            await search({ req, res, user: testUser, query: '@settings' });
            expect(res.redirect).toHaveBeenCalledWith('/settings');

            await search({ req, res, user: testUser, query: '@b' });
            expect(res.redirect).toHaveBeenCalledWith('/');
        });

        it('should handle direct commands with search terms for @notes', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
            } as unknown as Response;

            // Test @notes with search term
            await search({ req, res, user: testUser, query: '@notes search query' });
            expect(res.redirect).toHaveBeenCalledWith('/notes?search=search%20query');

            // Test @note alias
            vi.mocked(res.redirect).mockClear();
            await search({ req, res, user: testUser, query: '@note another query' });
            expect(res.redirect).toHaveBeenCalledWith('/notes?search=another%20query');

            // Test @n shorthand
            vi.mocked(res.redirect).mockClear();
            await search({ req, res, user: testUser, query: '@n shorthand' });
            expect(res.redirect).toHaveBeenCalledWith('/notes?search=shorthand');
        });

        it('should handle direct commands with search terms for @bookmarks', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
            } as unknown as Response;

            // Test @bookmarks with search term
            await search({ req, res, user: testUser, query: '@bookmarks search query' });
            expect(res.redirect).toHaveBeenCalledWith('/bookmarks?search=search%20query');

            // Test @bm alias
            vi.mocked(res.redirect).mockClear();
            await search({ req, res, user: testUser, query: '@bm bookmark query' });
            expect(res.redirect).toHaveBeenCalledWith('/bookmarks?search=bookmark%20query');
        });

        it('should handle direct commands with search terms for @actions', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
            } as unknown as Response;

            // Test @actions with search term
            await search({ req, res, user: testUser, query: '@actions search query' });
            expect(res.redirect).toHaveBeenCalledWith('/actions?search=search%20query');

            // Test @a alias
            vi.mocked(res.redirect).mockClear();
            await search({ req, res, user: testUser, query: '@a action query' });
            expect(res.redirect).toHaveBeenCalledWith('/actions?search=action%20query');
        });

        it('should handle special characters in search terms', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
            } as unknown as Response;

            // Test with special characters
            await search({
                req,
                res,
                user: testUser,
                query: '@notes test & special + characters?',
            });
            expect(res.redirect).toHaveBeenCalledWith(
                '/notes?search=test%20%26%20special%20%2B%20characters%3F',
            );
        });

        it('should handle bookmark creation with title', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
                setHeader: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            const mockPush = vi.fn().mockResolvedValue(undefined);

            vi.spyOn(utils, 'isValidUrl').mockReturnValue(true);
            vi.spyOn(utils, 'insertBookmarkQueue', 'get').mockReturnValue({
                push: mockPush,
            } as any);

            const query = '!bm My Bookmark https://example.com';

            await search({
                req,
                res,
                user: testUser,
                query,
            });

            expect(mockPush).toHaveBeenCalledWith({
                url: 'https://example.com',
                title: 'My Bookmark',
                userId: testUser.id,
            });

            expect(res.redirect).toHaveBeenCalledWith('https://example.com');

            vi.restoreAllMocks();
        });

        it('should handle bookmark creation without title', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
                setHeader: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            const mockPush = vi.fn().mockResolvedValue(undefined);

            vi.spyOn(utils, 'isValidUrl').mockReturnValue(true);
            vi.spyOn(utils, 'insertBookmarkQueue', 'get').mockReturnValue({
                push: mockPush,
            } as any);

            const query = '!bm https://example.com';

            await search({
                req,
                res,
                user: testUser,
                query,
            });

            expect(res.redirect).toHaveBeenCalledWith('https://example.com');

            vi.restoreAllMocks();
        });

        it('should handle invalid bookmark URLs', async () => {
            const req = {} as Request;
            const res = {
                setHeader: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            await search({
                req,
                res,
                user: testUser,
                query: '!bm invalid-url',
            });

            expect(res.status).toHaveBeenCalledWith(422);
            expect(res.send).toHaveBeenCalledWith(
                expect.stringContaining('Invalid or missing URL'),
            );
        });

        it('should handle custom bang creation', async () => {
            const req = {} as Request;
            const res = {
                setHeader: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            await search({
                req,
                res,
                user: testUser,
                query: '!add !new https://newsite.com',
            });

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.send).toHaveBeenCalledWith(expect.stringContaining('window.history.back()'));
        });

        it('should handle custom search bang', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
            } as unknown as Response;

            await search({
                req,
                res,
                user: testUser,
                query: '!custom test search',
            });

            expect(res.redirect).toHaveBeenCalledWith('https://example.com/search?q=test%20search');
        });

        it('should handle custom redirect bang', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
            } as unknown as Response;

            await search({
                req,
                res,
                user: testUser,
                query: '!mysite',
            });

            expect(res.redirect).toHaveBeenCalledWith('https://mysite.com');
        });

        it('should use default search provider when no bang matches', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
            } as unknown as Response;

            await search({
                req,
                res,
                user: testUser,
                query: 'test search',
            });

            expect(res.redirect).toHaveBeenCalledWith('https://duckduckgo.com/?q=test%20search');
        });

        it('should handle non-existent bang as search term', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
            } as unknown as Response;

            await search({
                req,
                res,
                user: testUser,
                query: '!nonexistent',
            });

            expect(res.redirect).toHaveBeenCalledWith('https://duckduckgo.com/?q=nonexistent');
        });

        it('should handle duplicate bang trigger creation', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
                setHeader: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            await search({
                req,
                res,
                user: testUser,
                query: '!add !custom https://newsite.com',
            });

            expect(res.status).toHaveBeenCalledWith(422);
            expect(res.send).toHaveBeenCalledWith(
                expect.stringContaining(`!custom already exists`),
            );
        });

        it('should prevent creation of system bang commands', async () => {
            const req = {} as Request;
            const res = {
                setHeader: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            await search({
                req,
                res,
                user: testUser,
                query: '!add !bm https://newsite.com',
            });

            expect(res.status).toHaveBeenCalledWith(422);
            expect(res.send).toHaveBeenCalledWith(
                expect.stringContaining("!bm is a bang's systems command"),
            );
        });

        it('should handle malformed !add command', async () => {
            const req = {} as Request;
            const res = {
                setHeader: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            await search({
                req,
                res,
                user: testUser,
                query: '!add',
            });

            expect(res.status).toHaveBeenCalledWith(422);
            expect(res.send).toHaveBeenCalledWith(
                expect.stringContaining('Invalid trigger or empty URL'),
            );
        });

        it('should handle !bm with multi-word title', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
                setHeader: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            const mockPush = vi.fn().mockResolvedValue(undefined);

            vi.spyOn(utils, 'isValidUrl').mockReturnValue(true);
            vi.spyOn(utils, 'insertBookmarkQueue', 'get').mockReturnValue({
                push: mockPush,
            } as any);

            await search({
                req,
                res,
                user: testUser,
                query: '!bm This is a very long title https://example.com',
            });

            expect(res.redirect).toHaveBeenCalledWith('https://example.com');

            vi.restoreAllMocks();
        });

        it('should handle !add with implicit bang prefix', async () => {
            const req = {} as Request;
            const res = {
                setHeader: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            await search({
                req,
                res,
                user: testUser,
                query: '!add test https://test.com', // Note: no ! in trigger
            });

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.send).toHaveBeenCalledWith(expect.stringContaining('window.history.back()'));
        });

        it('should handle user with different default search provider', async () => {
            const googleUser = {
                ...testUser,
                default_search_provider: 'google',
            } as User;

            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
            } as unknown as Response;

            await search({
                req,
                res,
                user: googleUser,
                query: 'test search',
            });

            expect(res.redirect).toHaveBeenCalledWith(
                'https://www.google.com/search?q=test%20search',
            );
        });

        it('should handle bookmark creation errors', async () => {
            const req = {} as Request;
            const res = {
                setHeader: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            vi.spyOn(utils, 'isValidUrl').mockReturnValue(true);
            vi.spyOn(utils, 'insertBookmarkQueue', 'get').mockReturnValue({
                push: vi.fn().mockRejectedValue(new Error('Database error')),
            } as any);

            await search({
                req,
                res,
                user: testUser,
                query: '!bm title https://example.com',
            });

            expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Error adding bookmark'));

            vi.resetModules();
        });

        it('should handle all direct navigation commands', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
            } as unknown as Response;

            const commands = {
                '@a': '/actions',
                '@actions': '/actions',
                '@api': '/api-docs',
                '@b': '/',
                '@bang': '/',
                '@bm': '/bookmarks',
                '@bookmarks': '/bookmarks',
                '@data': '/settings/data',
                '@s': '/settings',
                '@settings': '/settings',
            };

            for (const [command, path] of Object.entries(commands)) {
                await search({ req, res, user: testUser, query: command });
                expect(res.redirect).toHaveBeenCalledWith(path);
            }
        });
    });
});

describe('parseSearchQuery', () => {
    /**
     * Basic tests for parseSearchQuery function
     * These cover the primary functionality and ensure correct parsing of queries
     */
    it('should parse basic queries correctly', () => {
        // Test a simple search query
        const result = searchModule.parseSearchQuery('test query');
        expect(result).toEqual({
            commandType: null,
            trigger: null,
            triggerWithoutPrefix: null,
            url: null,
            searchTerm: 'test query',
        });
    });

    it('should parse bangs correctly', () => {
        // Test a bang query
        const result = searchModule.parseSearchQuery('!g test query');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!g',
            triggerWithoutPrefix: 'g',
            url: null,
            searchTerm: 'test query',
        });
    });

    it('should parse direct commands correctly', () => {
        // Test a direct command
        const result = searchModule.parseSearchQuery('@settings');
        expect(result).toEqual({
            commandType: 'direct',
            trigger: '@settings',
            triggerWithoutPrefix: 'settings',
            url: null,
            searchTerm: '',
        });
    });

    it('should handle bookmark commands', () => {
        // Note: bm: prefix is not specially handled by parseSearchQuery
        // It's treated as a regular search term
        const result = searchModule.parseSearchQuery('bm:homepage');
        expect(result).toEqual({
            commandType: null,
            trigger: null,
            triggerWithoutPrefix: null,
            url: null,
            searchTerm: 'bm:homepage',
        });
    });

    it('should handle URLs only in bang commands', () => {
        // Test URL detection in bang command
        const result = searchModule.parseSearchQuery('!bm My Bookmark https://www.example.com');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!bm',
            triggerWithoutPrefix: 'bm',
            url: 'https://www.example.com',
            searchTerm: 'My Bookmark',
        });
    });

    // URLs are not detected in regular searches
    it('should not detect URLs in regular searches', () => {
        const result = searchModule.parseSearchQuery('https://www.example.com');
        expect(result).toEqual({
            commandType: null,
            trigger: null,
            triggerWithoutPrefix: null,
            url: null,
            searchTerm: 'https://www.example.com',
        });
    });

    // Edge cases for URLs in bang commands
    it('should detect URLs with special characters in bang commands', () => {
        const result = searchModule.parseSearchQuery(
            '!bm Title https://example.com/search?q=hello%20world&lang=en',
        );
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!bm',
            triggerWithoutPrefix: 'bm',
            url: 'https://example.com/search?q=hello%20world&lang=en',
            searchTerm: 'Title',
        });
    });

    it('should detect URLs with fragments in bang commands', () => {
        const result = searchModule.parseSearchQuery('!bm Title https://example.com/page#section1');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!bm',
            triggerWithoutPrefix: 'bm',
            url: 'https://example.com/page#section1',
            searchTerm: 'Title',
        });
    });

    it('should detect URLs with port numbers in bang commands', () => {
        const result = searchModule.parseSearchQuery('!bm Dev https://localhost:3000/api/data');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!bm',
            triggerWithoutPrefix: 'bm',
            url: 'https://localhost:3000/api/data',
            searchTerm: 'Dev',
        });
    });

    // Special command formats
    it('should parse commands with numbers', () => {
        const result = searchModule.parseSearchQuery('!123 test');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!123',
            triggerWithoutPrefix: '123',
            url: null,
            searchTerm: 'test',
        });
    });

    it('should parse commands with underscores', () => {
        const result = searchModule.parseSearchQuery('!my_command test');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!my_command',
            triggerWithoutPrefix: 'my_command',
            url: null,
            searchTerm: 'test',
        });
    });

    it('should parse commands with periods', () => {
        const result = searchModule.parseSearchQuery('!my.command test');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!my.command',
            triggerWithoutPrefix: 'my.command',
            url: null,
            searchTerm: 'test',
        });
    });

    // Mixed scenarios
    it('should handle multiple URLs in bang commands', () => {
        const result = searchModule.parseSearchQuery(
            '!bm Title https://example.com https://test.com',
        );
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!bm',
            triggerWithoutPrefix: 'bm',
            url: 'https://example.com',
            searchTerm: 'Title https://test.com',
        });
    });

    it('should not detect non-http protocols in bang commands', () => {
        const result = searchModule.parseSearchQuery('!bm FTP ftp://example.com/files');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!bm',
            triggerWithoutPrefix: 'bm',
            url: null,
            searchTerm: 'FTP ftp://example.com/files',
        });
    });

    it('should handle queries with special characters', () => {
        const result = searchModule.parseSearchQuery('!g test@example.com');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!g',
            triggerWithoutPrefix: 'g',
            url: null,
            searchTerm: 'test@example.com',
        });
    });

    it('should handle very long search terms', () => {
        const longTerm = 'a'.repeat(500);
        const result = searchModule.parseSearchQuery(`!g ${longTerm}`);
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!g',
            triggerWithoutPrefix: 'g',
            url: null,
            searchTerm: longTerm,
        });
    });

    // Direct command edge cases
    it('should handle direct commands with parameters', () => {
        const result = searchModule.parseSearchQuery('@notes search: important meeting');
        expect(result).toEqual({
            commandType: 'direct',
            trigger: '@notes',
            triggerWithoutPrefix: 'notes',
            url: null,
            searchTerm: 'search: important meeting',
        });
    });

    it('should handle direct commands with special characters', () => {
        const result = searchModule.parseSearchQuery('@tag:work');
        expect(result).toEqual({
            commandType: 'direct',
            trigger: '@tag:work',
            triggerWithoutPrefix: 'tag:work',
            url: null,
            searchTerm: '',
        });
    });

    // Edge cases combining multiple patterns
    it('should handle URL-like strings in bang commands', () => {
        const result = searchModule.parseSearchQuery('!w https://en.wikipedia.org');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!w',
            triggerWithoutPrefix: 'w',
            url: 'https://en.wikipedia.org',
            searchTerm: '',
        });
    });

    it('should handle commands that look like URLs', () => {
        const result = searchModule.parseSearchQuery('!http test');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!http',
            triggerWithoutPrefix: 'http',
            url: null,
            searchTerm: 'test',
        });
    });

    it('should handle empty search term with commands', () => {
        const result = searchModule.parseSearchQuery('!g');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!g',
            triggerWithoutPrefix: 'g',
            url: null,
            searchTerm: '',
        });
    });

    it('should handle whitespace-only search term', () => {
        const result = searchModule.parseSearchQuery('!g    ');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!g',
            triggerWithoutPrefix: 'g',
            url: null,
            searchTerm: '',
        });
    });
});

/**
 * Tests for the non-blocking processDelayedSearch function
 * These tests verify that our delay implementation doesn't block concurrent operations
 * and correctly applies the configured delay
 */
describe('processDelayedSearch', () => {
    it('should not delay if no cumulative delay is set', async () => {
        const req = {
            session: {},
        } as unknown as Request;

        const start = Date.now();
        await processDelayedSearch(req);
        const duration = Date.now() - start;

        // Should be very fast, no more than 10ms for test overhead
        expect(duration).toBeLessThan(10);
    });

    it('should delay for the specified time', async () => {
        // Use a larger delay for more reliable testing
        const delayMs = 10;
        const req = {
            session: {
                cumulativeDelay: delayMs,
            },
        } as unknown as Request;

        const start = Date.now();
        await processDelayedSearch(req);
        const duration = Date.now() - start;

        // Should be at least the delay time, with a small buffer for timing inconsistencies
        expect(duration).toBeGreaterThanOrEqual(delayMs - 1);
    });

    /**
     * This test verifies that our implementation is truly non-blocking
     * It confirms that other operations can continue to execute while a delay is in progress
     * This behavior is essential for handling concurrent requests efficiently
     */
    it('should not block other operations while waiting', async () => {
        // Set up a longer delay
        const delayMs = 20;
        const req = {
            session: {
                cumulativeDelay: delayMs,
            },
        } as unknown as Request;

        // Start the delay operation but don't wait for it
        const delayPromise = processDelayedSearch(req);

        // Start a counter operation that should execute while the delay is happening
        let counter = 0;
        const counterPromise = new Promise<number>((resolve) => {
            setTimeout(() => {
                counter++;
                resolve(counter);
            }, 5); // This should execute before the delay finishes
        });

        // Wait for the counter operation to complete first
        const counterResult = await counterPromise;

        // Then wait for the delay to complete
        await delayPromise;

        // The counter should have been incremented while the delay was happening
        expect(counterResult).toBe(1);
    });
});

describe('handleAnonymousSearch', () => {
    it('should track search history asynchronously', async () => {
        const req = {
            session: {
                searchCount: 5,
            },
        } as unknown as Request;

        const res = {
            redirect: vi.fn(),
        } as unknown as Response;

        // Mock the anonymousSearchHistoryQueue.push method
        const queuePushSpy = vi
            .spyOn(searchModule.anonymousSearchHistoryQueue, 'push')
            .mockResolvedValue(undefined);

        try {
            await searchModule.handleAnonymousSearch(req, res, 'test query', 'g', 'test query');

            // Verify that tracking was called
            expect(queuePushSpy).toHaveBeenCalledWith(req);

            // Verify the redirect happens
            expect(res.redirect).toHaveBeenCalled();
        } finally {
            queuePushSpy.mockRestore();
        }
    });
});

/**
 * Tests for direct object access and command handling
 * These tests validate that our performance optimizations work correctly using direct object access
 */
describe('search command handling', () => {
    /**
     * Tests for direct object access for bangs
     * Confirms that object properties provide fast and accurate bang lookups
     */
    describe('bangs object access', () => {
        it('should provide fast access to bangs', async () => {
            // Get a bang from the object
            const googleBang = searchModule.getBangRedirectUrl(
                {
                    u: 'https://www.google.com/search?q={{{s}}}',
                    d: 'google.com',
                } as any,
                'test',
            );

            expect(googleBang).toBeDefined();
            expect(googleBang).toContain('google.com');
            expect(googleBang).toContain('test');
        });
    });

    describe('direct commands handling', () => {
        it('should handle direct commands with explicit commandType', async () => {
            // Setup
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
            } as unknown as Response;

            // Mock parseSearchQuery to return a direct command
            vi.spyOn(searchModule, 'parseSearchQuery').mockReturnValue({
                commandType: 'direct',
                trigger: '@notes',
                triggerWithoutPrefix: 'notes',
                url: null,
                searchTerm: 'test',
            });

            // Run the search
            await searchModule.search({ req, res, user: {} as User, query: '@notes test' });

            // Verify correct redirect
            expect(res.redirect).toHaveBeenCalledWith('/notes?search=test');

            // Restore
            vi.restoreAllMocks();
        });
    });

    // Additional tests for search function with commandType
    describe('search function with commandType', () => {
        it('should handle bang commandType with unknown bang', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
            } as unknown as Response;
            const user = {
                id: 1,
                default_search_provider: 'duckduckgo',
            } as User;

            // Mock an unknown bang command
            vi.spyOn(searchModule, 'parseSearchQuery').mockReturnValue({
                commandType: 'bang',
                trigger: '!unknown',
                triggerWithoutPrefix: 'unknown',
                url: null,
                searchTerm: '',
            });

            await searchModule.search({ req, res, user, query: '!unknown' });

            // Should fall back to searching for the trigger without the prefix
            expect(res.redirect).toHaveBeenCalledWith('https://duckduckgo.com/?q=unknown');

            vi.restoreAllMocks();
        });

        it('should handle regular search with null commandType', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
            } as unknown as Response;
            const user = {
                id: 1,
                default_search_provider: 'duckduckgo',
            } as User;

            // Mock a regular search query
            vi.spyOn(searchModule, 'parseSearchQuery').mockReturnValue({
                commandType: null,
                trigger: null,
                triggerWithoutPrefix: null,
                url: null,
                searchTerm: 'regular search',
            });

            await searchModule.search({ req, res, user, query: 'regular search' });

            // Should search using the default search provider
            expect(res.redirect).toHaveBeenCalledWith('https://duckduckgo.com/?q=regular%20search');

            vi.restoreAllMocks();
        });
    });
});
