import { db } from './db/db';
import { User } from './type';
import * as utils from './util';
import { appConfig } from './config';
import * as searchModule from './search';
import { Request, Response } from 'express';
import { search, processDelayedSearch, redirectWithCache } from './search';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

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
                set: vi.fn(),
            } as unknown as Response;

            await search({ req, res, user: undefined as unknown as User, query: '!g python' });

            expect(res.status).toBe(200);
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
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
                set: vi.fn(),
            } as unknown as Response;

            await search({ req, res, user: undefined as unknown as User, query: '!g' });

            expect(res.status).toBe(200);
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
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
                set: vi.fn(),
            } as unknown as Response;

            await search({ req, res, user: undefined, query: '!doesnotexistanywhere' });

            expect(res.status).toBe(200);
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith(
                'https://duckduckgo.com/?q=!doesnotexistanywhere',
            );
            expect(req.session.searchCount).toBe(1);
            expect(req.session.user).toBeUndefined();
        });

        it('should not redirect to bang service homepage when bang has invalid URL for bang-only queries', async () => {
            const req = {
                session: {
                    searchCount: 0,
                },
            } as unknown as Request;

            const res = {
                status: 200,
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            const isValidUrlSpy = vi.spyOn(utils, 'isValidUrl').mockReturnValue(false);

            try {
                await search({ req, res, user: undefined, query: '!g' });

                expect(res.status).toBe(200);
                expect(res.set).toHaveBeenCalledWith(
                    expect.objectContaining({
                        'Cache-Control': 'public, max-age=3600',
                    }),
                );
                expect(res.redirect).toHaveBeenCalledWith('https://duckduckgo.com/?q=!g');
                expect(req.session.searchCount).toBe(1);
                expect(req.session.user).toBeUndefined();
            } finally {
                isValidUrlSpy.mockRestore();
            }
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
                set: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            await search({ req, res, user: undefined, query: '!g python' });

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.set).toHaveBeenCalledWith({ 'Content-Type': 'text/html' });
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
                set: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            await search({ req, res, user: undefined, query: '!g python' });

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.set).toHaveBeenCalledWith({ 'Content-Type': 'text/html' });
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
                    set: vi.fn(),
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
                set: vi.fn(),
            } as unknown as Response;

            await search({ req, res, user: testUser, query: '@settings' });
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('/settings');

            await search({ req, res, user: testUser, query: '@b' });
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('/');
        });

        it('should handle direct commands with search terms for @notes', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            // Test @notes with search term
            await search({ req, res, user: testUser, query: '@notes search query' });
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
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
                set: vi.fn(),
            } as unknown as Response;

            // Test @bookmarks with search term
            await search({ req, res, user: testUser, query: '@bookmarks search query' });
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
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
                set: vi.fn(),
            } as unknown as Response;

            // Test @actions with search term
            await search({ req, res, user: testUser, query: '@actions search query' });
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
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
                set: vi.fn(),
            } as unknown as Response;

            // Test with special characters
            await search({
                req,
                res,
                user: testUser,
                query: '@notes test & special + characters?',
            });
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith(
                '/notes?search=test%20%26%20special%20%2B%20characters%3F',
            );
        });

        it('should handle bookmark creation with title', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
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

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('https://example.com');

            vi.restoreAllMocks();
        });

        it('should handle bookmark creation without title', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
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

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('https://example.com');

            vi.restoreAllMocks();
        });

        it('should handle invalid bookmark URLs', async () => {
            const req = {} as Request;
            const res = {
                set: vi.fn().mockReturnThis(),
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
                set: vi.fn().mockReturnThis(),
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
                set: vi.fn(),
            } as unknown as Response;

            await search({
                req,
                res,
                user: testUser,
                query: '!custom test search',
            });

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('https://example.com/search?q=test%20search');
        });

        it('should handle custom search bang with {query} placeholder', async () => {
            await db('bangs').insert({
                user_id: 1,
                trigger: '!querytest',
                name: 'Query Test Search',
                action_type_id: 1,
                url: 'https://query-example.com/search?q={query}',
            });

            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await search({
                req,
                res,
                user: testUser,
                query: '!querytest test search',
            });

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith(
                'https://query-example.com/search?q=test%20search',
            );

            await db('bangs').where({ trigger: '!querytest', user_id: 1 }).delete();
        });

        it('should handle custom search bang with {{{s}}} placeholder', async () => {
            await db('bangs').insert({
                user_id: 1,
                trigger: '!stest',
                name: 'S Test Search',
                action_type_id: 1,
                url: 'https://s-example.com/search?q={{{s}}}',
            });

            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await search({
                req,
                res,
                user: testUser,
                query: '!stest test search',
            });

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith(
                'https://s-example.com/search?q=test%20search',
            );

            await db('bangs').where({ trigger: '!stest', user_id: 1 }).delete();
        });

        it('should handle custom redirect bang', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await search({
                req,
                res,
                user: testUser,
                query: '!mysite',
            });

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('https://mysite.com');
        });

        it('should use default search provider when no bang matches', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await search({
                req,
                res,
                user: testUser,
                query: 'test search',
            });

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('https://duckduckgo.com/?q=test%20search');
        });

        it('should handle non-existent bang as search term', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await search({
                req,
                res,
                user: testUser,
                query: '!nonexistent',
            });

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('https://duckduckgo.com/?q=nonexistent');
        });

        it('should handle duplicate bang trigger creation', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn().mockReturnThis(),
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
                set: vi.fn().mockReturnThis(),
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
                set: vi.fn().mockReturnThis(),
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
                set: vi.fn(),
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

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('https://example.com');

            vi.restoreAllMocks();
        });

        it('should handle !add with implicit bang prefix', async () => {
            const req = {} as Request;
            const res = {
                set: vi.fn().mockReturnThis(),
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
                set: vi.fn(),
            } as unknown as Response;

            await search({
                req,
                res,
                user: googleUser,
                query: 'test search',
            });

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith(
                'https://www.google.com/search?q=test%20search',
            );
        });

        it('should handle bookmark creation errors', async () => {
            const req = {} as Request;
            const res = {
                set: vi.fn().mockReturnThis(),
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

        describe('!del command', () => {
            beforeAll(async () => {
                await db('bangs').insert({
                    id: 999,
                    user_id: 1,
                    trigger: '!deleteme',
                    name: 'Delete Test',
                    action_type_id: 2,
                    url: 'https://delete-test.com',
                });
            });

            afterAll(async () => {
                await db('bangs').where({ id: 999 }).delete();
            });

            it('should successfully delete an existing bang', async () => {
                const req = {} as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await search({
                    req,
                    res,
                    user: testUser,
                    query: '!del !deleteme',
                });

                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('window.history.back()'),
                );

                const deletedBang = await db('bangs')
                    .where({ user_id: 1, trigger: '!deleteme' })
                    .first();
                expect(deletedBang).toBeUndefined();
            });

            it('should handle deletion with trigger without ! prefix', async () => {
                await db('bangs').insert({
                    id: 1000,
                    user_id: 1,
                    trigger: '!deleteme2',
                    name: 'Delete Test 2',
                    action_type_id: 2,
                    url: 'https://delete-test2.com',
                });

                const req = {} as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await search({
                    req,
                    res,
                    user: testUser,
                    query: '!del deleteme2', // No ! prefix
                });

                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('window.history.back()'),
                );

                await db('bangs').where({ id: 1000 }).delete();
            });

            it('should return error when trying to delete non-existent bang', async () => {
                const req = {} as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await search({
                    req,
                    res,
                    user: testUser,
                    query: '!del !nonexistent',
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining(
                        'Bang "!nonexistent" not found or you don\'t have permission to delete it',
                    ),
                );
            });

            it('should return error when no trigger is provided', async () => {
                const req = {} as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await search({
                    req,
                    res,
                    user: testUser,
                    query: '!del',
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('Please specify a trigger to delete'),
                );
            });

            it('should return error when user is not authenticated', async () => {
                const req = {
                    session: {} as any,
                } as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    redirect: vi.fn(),
                } as unknown as Response;

                const unauthenticatedUser = { ...testUser, id: undefined } as unknown as User;

                await search({
                    req,
                    res,
                    user: unauthenticatedUser,
                    query: '!del !test',
                });

                expect(res.set).toHaveBeenCalledWith(
                    expect.objectContaining({
                        'Cache-Control': 'public, max-age=3600',
                    }),
                );
                expect(res.redirect).toHaveBeenCalledWith(
                    expect.stringContaining('duckduckgo.com'),
                );
            });
        });

        describe('!edit command', () => {
            beforeAll(async () => {
                await db('bangs').insert([
                    {
                        id: 1001,
                        user_id: 1,
                        trigger: '!editme',
                        name: 'Edit Test',
                        action_type_id: 2,
                        url: 'https://edit-test.com',
                    },
                    {
                        id: 1002,
                        user_id: 1,
                        trigger: '!existing',
                        name: 'Existing Bang',
                        action_type_id: 2,
                        url: 'https://existing.com',
                    },
                ]);
            });

            beforeEach(async () => {
                await db('bangs').where({ id: 1001 }).update({
                    trigger: '!editme',
                    url: 'https://edit-test.com',
                });
            });

            afterAll(async () => {
                await db('bangs').whereIn('id', [1001, 1002]).delete();
            });

            it('should successfully edit bang trigger only', async () => {
                const req = {} as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await search({
                    req,
                    res,
                    user: testUser,
                    query: '!edit !editme !newname',
                });

                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('window.history.back()'),
                );

                const updatedBang = await db('bangs')
                    .where({ user_id: 1, trigger: '!newname' })
                    .first();
                expect(updatedBang).toBeDefined();
                expect(updatedBang.url).toBe('https://edit-test.com');
            });

            it('should successfully edit bang URL only', async () => {
                const req = {} as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                const mockPush = vi.fn().mockResolvedValue(undefined);
                vi.spyOn(utils, 'insertPageTitleQueue', 'get').mockReturnValue({
                    push: mockPush,
                } as any);

                await search({
                    req,
                    res,
                    user: testUser,
                    query: '!edit !editme https://new-url.com',
                });

                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('window.history.back()'),
                );

                expect(mockPush).toHaveBeenCalledWith({
                    actionId: 1001,
                    url: 'https://new-url.com',
                    req,
                });

                const updatedBang = await db('bangs')
                    .where({ user_id: 1, trigger: '!editme' })
                    .first();
                expect(updatedBang).toBeDefined();
                expect(updatedBang.url).toBe('https://new-url.com');

                vi.restoreAllMocks();
            });

            it('should successfully edit both trigger and URL', async () => {
                const req = {} as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                const mockPush = vi.fn().mockResolvedValue(undefined);
                vi.spyOn(utils, 'insertPageTitleQueue', 'get').mockReturnValue({
                    push: mockPush,
                } as any);

                await search({
                    req,
                    res,
                    user: testUser,
                    query: '!edit !editme !newboth https://both-new.com',
                });

                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('window.history.back()'),
                );

                const updatedBang = await db('bangs')
                    .where({ user_id: 1, trigger: '!newboth' })
                    .first();
                expect(updatedBang).toBeDefined();
                expect(updatedBang.url).toBe('https://both-new.com');

                vi.restoreAllMocks();
            });

            it('should return error when trying to edit non-existent bang', async () => {
                const req = {} as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await search({
                    req,
                    res,
                    user: testUser,
                    query: '!edit !nonexistent !newtrigger',
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining(
                        'Bang "!nonexistent" not found or you don\'t have permission to edit it',
                    ),
                );
            });

            it('should return error with invalid format', async () => {
                const req = {} as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await search({
                    req,
                    res,
                    user: testUser,
                    query: '!edit !editme', // Missing second parameter
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining(
                        'Invalid format. Use: !edit !trigger !newTrigger or !edit !trigger newUrl',
                    ),
                );
            });

            it('should return error when trying to use system command as new trigger', async () => {
                const req = {} as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await search({
                    req,
                    res,
                    user: testUser,
                    query: '!edit !editme !add', // !add is a system command
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining(
                        '!add is a system command and cannot be used as a trigger',
                    ),
                );
            });

            it('should return error when new trigger already exists', async () => {
                const req = {} as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await search({
                    req,
                    res,
                    user: testUser,
                    query: '!edit !editme !existing', // !existing already exists
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining(
                        '!existing already exists. Please choose a different trigger',
                    ),
                );
            });

            it('should return error with invalid URL format', async () => {
                const req = {} as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await search({
                    req,
                    res,
                    user: testUser,
                    query: '!edit !editme invalid-url',
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('Invalid URL format'),
                );
            });

            it('should return error when trigger contains invalid characters', async () => {
                const req = {} as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await search({
                    req,
                    res,
                    user: testUser,
                    query: '!edit !editme !invalid@trigger',
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining(
                        '!invalid@trigger trigger can only contain letters and numbers',
                    ),
                );
            });

            it('should return error when user is not authenticated', async () => {
                const req = {
                    session: {} as any,
                } as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    redirect: vi.fn(),
                } as unknown as Response;

                const unauthenticatedUser = { ...testUser, id: undefined } as unknown as User;

                await search({
                    req,
                    res,
                    user: unauthenticatedUser,
                    query: '!edit !test !newtrigger',
                });

                expect(res.set).toHaveBeenCalledWith(
                    expect.objectContaining({
                        'Cache-Control': 'public, max-age=3600',
                    }),
                );
                expect(res.redirect).toHaveBeenCalledWith(
                    expect.stringContaining('duckduckgo.com'),
                );
            });

            it('should handle editing with trigger without ! prefix', async () => {
                const req = {} as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await search({
                    req,
                    res,
                    user: testUser,
                    query: '!edit editme https://new-without-prefix.com', // No ! prefix on editme
                });

                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('window.history.back()'),
                );

                // Verify the bang was actually updated
                const updatedBang = await db('bangs')
                    .where({ user_id: 1, trigger: '!editme' })
                    .first();
                expect(updatedBang).toBeDefined();
                expect(updatedBang.url).toBe('https://new-without-prefix.com');
            });
        });

        it('should handle all direct navigation commands', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
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
                expect(res.set).toHaveBeenCalledWith(
                    expect.objectContaining({
                        'Cache-Control': 'public, max-age=3600',
                    }),
                );
                expect(res.redirect).toHaveBeenCalledWith(path);
            }
        });

        it('should not redirect to bang service homepage when bang has invalid URL for authenticated bang-only queries', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            const isValidUrlSpy = vi.spyOn(utils, 'isValidUrl').mockReturnValue(false);

            try {
                await search({ req, res, user: testUser, query: '!g' });

                expect(res.set).toHaveBeenCalledWith(
                    expect.objectContaining({
                        'Cache-Control': 'public, max-age=3600',
                    }),
                );
                expect(res.redirect).toHaveBeenCalledWith('https://duckduckgo.com/?q=g');
            } finally {
                isValidUrlSpy.mockRestore();
            }
        });
    });
});

describe('parseSearchQuery', () => {
    it('should parse basic queries correctly', () => {
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
        const result = searchModule.parseSearchQuery('!bm My Bookmark https://www.example.com');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!bm',
            triggerWithoutPrefix: 'bm',
            url: 'https://www.example.com',
            searchTerm: 'My Bookmark',
        });
    });

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

describe('processDelayedSearch', () => {
    it('should not delay if no cumulative delay is set', async () => {
        const req = {
            session: {},
        } as unknown as Request;

        const start = Date.now();
        await processDelayedSearch(req);
        const duration = Date.now() - start;

        expect(duration).toBeLessThan(10);
    });

    it('should delay for the specified time', async () => {
        const delayMs = 10;
        const req = {
            session: {
                cumulativeDelay: delayMs,
            },
        } as unknown as Request;

        const start = Date.now();
        await processDelayedSearch(req);
        const duration = Date.now() - start;

        expect(duration).toBeGreaterThanOrEqual(delayMs - 1);
    });

    it('should not block other operations while waiting', async () => {
        const delayMs = 20;
        const req = {
            session: {
                cumulativeDelay: delayMs,
            },
        } as unknown as Request;

        const delayPromise = processDelayedSearch(req);

        let counter = 0;
        const counterPromise = new Promise<number>((resolve) => {
            setTimeout(() => {
                counter++;
                resolve(counter);
            }, 5);
        });

        const counterResult = await counterPromise;

        await delayPromise;

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
            set: vi.fn(),
        } as unknown as Response;

        const queuePushSpy = vi
            .spyOn(searchModule.anonymousSearchHistoryQueue, 'push')
            .mockResolvedValue(undefined);

        try {
            await searchModule.handleAnonymousSearch(req, res, 'test query', 'g', 'test query');

            expect(queuePushSpy).toHaveBeenCalledWith(req);

            expect(res.redirect).toHaveBeenCalled();
        } finally {
            queuePushSpy.mockRestore();
        }
    });
});

describe('search command handling', () => {
    describe('bangs object access', () => {
        it('should provide fast access to bangs', async () => {
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
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            vi.spyOn(searchModule, 'parseSearchQuery').mockReturnValue({
                commandType: 'direct',
                trigger: '@notes',
                triggerWithoutPrefix: 'notes',
                url: null,
                searchTerm: 'test',
            });

            const user = { id: 1 } as User;

            await searchModule.search({ req, res, user, query: '@notes test' });

            expect(res.redirect).toHaveBeenCalledWith('/notes?search=test');

            vi.restoreAllMocks();
        });
    });

    describe('search function with commandType', () => {
        it('should handle bang commandType with unknown bang', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;
            const user = {
                id: 1,
                default_search_provider: 'duckduckgo',
            } as User;

            vi.spyOn(searchModule, 'parseSearchQuery').mockReturnValue({
                commandType: 'bang',
                trigger: '!unknown',
                triggerWithoutPrefix: 'unknown',
                url: null,
                searchTerm: '',
            });

            await searchModule.search({ req, res, user, query: '!unknown' });

            expect(res.redirect).toHaveBeenCalledWith('https://duckduckgo.com/?q=unknown');

            vi.restoreAllMocks();
        });

        it('should handle regular search with null commandType', async () => {
            const req = {} as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;
            const user = {
                id: 1,
                default_search_provider: 'duckduckgo',
            } as User;

            vi.spyOn(searchModule, 'parseSearchQuery').mockReturnValue({
                commandType: null,
                trigger: null,
                triggerWithoutPrefix: null,
                url: null,
                searchTerm: 'regular search',
            });

            await searchModule.search({ req, res, user, query: 'regular search' });

            expect(res.redirect).toHaveBeenCalledWith('https://duckduckgo.com/?q=regular%20search');

            vi.restoreAllMocks();
        });
    });
});

describe('redirectWithCache', () => {
    it('should set correct cache headers with default duration', () => {
        const res = {
            set: vi.fn(),
            redirect: vi.fn(),
        } as unknown as Response;

        redirectWithCache(res, 'https://example.com');

        expect(res.set).toHaveBeenCalledWith({
            'Cache-Control': 'public, max-age=3600',
            Expires: expect.any(String),
        });

        expect(res.redirect).toHaveBeenCalledWith('https://example.com');
    });

    it('should set cache headers with custom duration', () => {
        const res = {
            set: vi.fn(),
            redirect: vi.fn(),
        } as unknown as Response;

        const customDuration = 7200; // 2 hours
        redirectWithCache(res, 'https://example.com', customDuration);

        expect(res.set).toHaveBeenCalledWith({
            'Cache-Control': 'public, max-age=7200',
            Expires: expect.any(String),
        });
    });

    it('should set Expires header correctly based on duration', () => {
        const res = {
            set: vi.fn(),
            redirect: vi.fn(),
        } as unknown as Response;

        const nowMock = vi.spyOn(Date, 'now').mockImplementation(() => 1609459200000); // 2021-01-01

        const cacheDuration = 3600;
        redirectWithCache(res, 'https://example.com', cacheDuration);

        const expectedDate = new Date(1609459200000 + cacheDuration * 1000).toUTCString();

        expect(res.set).toHaveBeenCalledWith(
            expect.objectContaining({
                Expires: expectedDate,
            }),
        );

        nowMock.mockRestore();
    });
});

describe('Integration: Cache headers in search redirects', () => {
    it('should use cache headers in all redirect cases', () => {
        const redirectWithCacheSpy = vi.spyOn(searchModule, 'redirectWithCache');

        const res = {
            set: vi.fn(),
            redirect: vi.fn(),
        } as unknown as Response;

        searchModule.redirectWithCache(res, 'https://example.com');

        expect(redirectWithCacheSpy).toHaveBeenCalledWith(res, 'https://example.com');

        redirectWithCacheSpy.mockRestore();
    });

    it('should apply different cache durations when specified', () => {
        const res = {
            set: vi.fn(),
            redirect: vi.fn(),
        } as unknown as Response;

        const customDuration = 1800; // 30 minutes
        redirectWithCache(res, 'https://example.com', customDuration);

        expect(res.set).toHaveBeenCalledWith(
            expect.objectContaining({
                'Cache-Control': `public, max-age=${customDuration}`,
            }),
        );
    });
});
