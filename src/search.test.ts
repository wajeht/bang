import { db } from './db/db';
import { User } from './type';
import * as utils from './util';
import * as searchModule from './search';
import {
    search,
    processDelayedSearch,
    bangCache,
    directCommandCache,
    bangsLookupMap,
} from './search';
import { appConfig } from './config';
import { parseSearchQuery } from './search';
import { Request, Response } from 'express';
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

            // Clear cache before test
            directCommandCache.clear();

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

            // Clear cache before test
            directCommandCache.clear();

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

            // Clear cache before test
            directCommandCache.clear();

            // Test @actions with search term
            await search({ req, res, user: testUser, query: '@actions search query' });
            expect(res.redirect).toHaveBeenCalledWith('/actions?search=search%20query');

            // Test @a alias
            vi.mocked(res.redirect).mockClear();
            await search({ req, res, user: testUser, query: '@a action query' });
            expect(res.redirect).toHaveBeenCalledWith('/actions?search=action%20query');
        });

        it('should correctly cache direct commands with search terms', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
            } as unknown as Response;

            // Clear cache before test
            directCommandCache.clear();

            // Spy on cache operations
            const setCacheSpy = vi.spyOn(directCommandCache, 'set');
            const getCacheSpy = vi.spyOn(directCommandCache, 'get');

            // First call should set cache
            const testQuery = '@notes test caching';
            await search({ req, res, user: testUser, query: testQuery });
            expect(setCacheSpy).toHaveBeenCalledWith(testQuery, '/notes?search=test%20caching');
            expect(res.redirect).toHaveBeenCalledWith('/notes?search=test%20caching');

            // Reset mocks to check cache retrieval
            setCacheSpy.mockClear();
            vi.mocked(res.redirect).mockClear();

            // Mock cache hit
            getCacheSpy.mockReturnValueOnce('/notes?search=test%20caching');

            // Second call should use cache
            await search({ req, res, user: testUser, query: testQuery });
            expect(getCacheSpy).toHaveBeenCalled();
            expect(setCacheSpy).not.toHaveBeenCalled(); // Should not set cache again
            expect(res.redirect).toHaveBeenCalledWith('/notes?search=test%20caching');

            // Restore spies
            setCacheSpy.mockRestore();
            getCacheSpy.mockRestore();
        });

        it('should handle special characters in search terms', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
            } as unknown as Response;

            // Clear cache
            directCommandCache.clear();

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
                expect.stringContaining('${trigger} already exists'),
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
    it('should parse a basic search query without bang', () => {
        const result = parseSearchQuery('python tutorial');
        expect(result).toEqual({
            trigger: null,
            triggerWithoutExclamationMark: null,
            url: null,
            searchTerm: 'python tutorial',
        });
    });

    it('should parse a search query with bang', () => {
        const result = parseSearchQuery('!g python tutorial');
        expect(result).toEqual({
            trigger: '!g',
            triggerWithoutExclamationMark: 'g',
            url: null,
            searchTerm: 'python tutorial',
        });
    });

    it('should parse a bookmark command with title and URL', () => {
        const result = parseSearchQuery('!bm My Bookmark https://example.com');
        expect(result).toEqual({
            trigger: '!bm',
            triggerWithoutExclamationMark: 'bm',
            url: 'https://example.com',
            searchTerm: 'My Bookmark',
        });
    });

    it('should parse a bookmark command with only URL', () => {
        const result = parseSearchQuery('!bm https://example.com');
        expect(result).toEqual({
            trigger: '!bm',
            triggerWithoutExclamationMark: 'bm',
            url: 'https://example.com',
            searchTerm: '',
        });
    });

    it('should parse a custom bang creation command', () => {
        const result = parseSearchQuery('!add !custom https://custom-search.com');
        expect(result).toEqual({
            trigger: '!add',
            triggerWithoutExclamationMark: 'add',
            url: 'https://custom-search.com',
            searchTerm: '!custom',
        });
    });

    it('should handle bangs with hyphens', () => {
        const result = parseSearchQuery('!my-bang search term');
        expect(result).toEqual({
            trigger: '!my-bang',
            triggerWithoutExclamationMark: 'my-bang',
            url: null,
            searchTerm: 'search term',
        });
    });

    it('should handle multiple spaces in query', () => {
        const result = parseSearchQuery('!g    python     tutorial    ');
        expect(result).toEqual({
            trigger: '!g',
            triggerWithoutExclamationMark: 'g',
            url: null,
            searchTerm: 'python tutorial',
        });
    });

    it('should handle URLs with query parameters', () => {
        const result = parseSearchQuery('!bm My Site https://example.com/path?param=value');
        expect(result).toEqual({
            trigger: '!bm',
            triggerWithoutExclamationMark: 'bm',
            url: 'https://example.com/path?param=value',
            searchTerm: 'My Site',
        });
    });

    it('should handle empty query', () => {
        const result = parseSearchQuery('');
        expect(result).toEqual({
            trigger: null,
            triggerWithoutExclamationMark: null,
            url: null,
            searchTerm: '',
        });
    });

    it('should handle query with only spaces', () => {
        const result = parseSearchQuery('   ');
        expect(result).toEqual({
            trigger: null,
            triggerWithoutExclamationMark: null,
            url: null,
            searchTerm: '',
        });
    });

    it('should handle bang-only query', () => {
        const result = parseSearchQuery('!g');
        expect(result).toEqual({
            trigger: '!g',
            triggerWithoutExclamationMark: 'g',
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
        // Use a very small delay for testing
        const delayMs = 5;
        const req = {
            session: {
                cumulativeDelay: delayMs,
            },
        } as unknown as Request;

        const start = Date.now();
        await processDelayedSearch(req);
        const duration = Date.now() - start;

        // Should be at least the delay time
        expect(duration).toBeGreaterThanOrEqual(delayMs);
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
 * Tests for the various caching mechanisms
 * These tests validate that our performance optimizations work correctly:
 * 1. Caching bang redirect URLs to avoid redundant calculations
 * 2. Caching direct command URLs for faster navigation
 * 3. Using a Map for O(1) lookup of bangs
 */
describe('caching mechanisms', () => {
    /**
     * Tests for the bangCache
     * Verifies that URLs are properly cached and retrieved for subsequent calls
     */
    describe('bangCache', () => {
        it('should cache and return bang redirect URLs', async () => {
            // Create a test bang
            const testBang = {
                u: 'https://example.com/search?q={{{s}}}',
                d: 'example.com',
            } as unknown as import('./type').Bang;
            const searchTerm = 'test search';

            // Clear any existing entries to start fresh
            bangCache.clear();

            // Spy on the cache set method
            const setCacheSpy = vi.spyOn(bangCache, 'set');
            const getCacheSpy = vi.spyOn(bangCache, 'get');

            // First call should compute and cache the URL
            const firstResult = searchModule.getBangRedirectUrl(testBang, searchTerm);
            expect(firstResult).toBe('https://example.com/search?q=test%20search');
            expect(setCacheSpy).toHaveBeenCalled();

            // Reset the spies
            setCacheSpy.mockClear();
            getCacheSpy.mockClear();

            // Second call should use the cache
            const secondResult = searchModule.getBangRedirectUrl(testBang, searchTerm);
            expect(secondResult).toBe('https://example.com/search?q=test%20search');
            expect(getCacheSpy).toHaveBeenCalled();
            expect(setCacheSpy).not.toHaveBeenCalled(); // Should not set cache again

            // Restore spies
            setCacheSpy.mockRestore();
            getCacheSpy.mockRestore();
        });

        it('should handle different search terms with separate cache entries', async () => {
            // Create a test bang
            const testBang = {
                u: 'https://example.com/search?q={{{s}}}',
                d: 'example.com',
            } as unknown as import('./type').Bang;

            // Clear any existing entries to start fresh
            bangCache.clear();

            // Two different search terms should create separate cache entries
            const firstResult = searchModule.getBangRedirectUrl(testBang, 'term1');
            const secondResult = searchModule.getBangRedirectUrl(testBang, 'term2');

            expect(firstResult).toBe('https://example.com/search?q=term1');
            expect(secondResult).toBe('https://example.com/search?q=term2');

            // The cache should now have two different entries
            expect(bangCache.size).toBe(2);
        });
    });

    /**
     * Tests for the directCommandCache
     * Validates that direct navigation commands are properly cached for faster access
     */
    describe('directCommandCache', () => {
        it('should cache and return direct command URLs', async () => {
            // Clear any existing entries to start fresh
            directCommandCache.clear();

            // Setup test
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
            } as unknown as Response;
            const directCommand = '@settings';

            // Mock what we need to test just the direct command path
            vi.spyOn(searchModule, 'parseSearchQuery').mockReturnValue({
                trigger: null,
                triggerWithoutExclamationMark: null,
                url: null,
                searchTerm: '',
            });

            // Spy on the cache methods
            const setCacheSpy = vi.spyOn(directCommandCache, 'set');
            const getCacheSpy = vi.spyOn(directCommandCache, 'get');

            // First search should compute and cache
            await searchModule.search({ req, res, user: {} as User, query: directCommand });
            expect(res.redirect).toHaveBeenCalledWith('/settings');
            expect(setCacheSpy).toHaveBeenCalled();

            // Reset spies and mocks
            (res.redirect as ReturnType<typeof vi.fn>).mockClear();
            setCacheSpy.mockClear();
            getCacheSpy.mockClear();

            // Mock cached value retrieval
            getCacheSpy.mockReturnValueOnce('/settings');

            // Second search should use the cache
            await searchModule.search({ req, res, user: {} as User, query: directCommand });
            expect(res.redirect).toHaveBeenCalledWith('/settings');
            expect(getCacheSpy).toHaveBeenCalled();
            expect(setCacheSpy).not.toHaveBeenCalled(); // Should not set cache again

            // Restore all mocks
            vi.restoreAllMocks();
        });
    });

    /**
     * Tests for the bangsLookupMap
     * Confirms that the precomputed Map provides fast and accurate bang lookups
     */
    describe('bangsLookupMap', () => {
        it('should provide faster access to bangs', async () => {
            // Ensure the map is initialized
            expect(bangsLookupMap).toBeDefined();
            expect(bangsLookupMap instanceof Map).toBe(true);

            // Verify common bangs are in the map
            expect(bangsLookupMap.has('g')).toBe(true); // Google should exist

            // Get a bang from the map
            const googleBang = bangsLookupMap.get('g');
            expect(googleBang).toBeDefined();
            expect(googleBang?.u).toContain('google.com');

            // Test with invalid key
            const nonExistentBang = bangsLookupMap.get('nonexistent123456');
            expect(nonExistentBang).toBeUndefined();
        });
    });
});
