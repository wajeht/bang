import { dayjs } from '../libs';
import { config } from '../config';
import { Context } from '../context';
import { db } from '../tests/test-setup';
import { Request, Response } from 'express';
import { SearchUtils } from '../utils/search';
import type { User, AppContext } from '../type';
import type { SessionData } from 'express-session';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

let ctx: AppContext;
let searchUtils: ReturnType<typeof SearchUtils>;
let isValidUrl: any;
let insertBookmark: any;
let insertPageTitle: any;
let checkDuplicateBookmarkUrl: any;

const mockLogger = () => ({
    clone: () => mockLogger(),
    tag: () => mockLogger(),
    time: () => ({ stop: () => {} }),
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
});

describe('search', () => {
    beforeAll(async () => {
        ctx = await Context();
        searchUtils = SearchUtils(ctx);
    });

    beforeEach(() => {
        isValidUrl = vi.spyOn(ctx.utils.validation, 'isValidUrl').mockReturnValue(true);
        insertBookmark = vi.spyOn(ctx.utils.util, 'insertBookmark').mockResolvedValue(undefined);
        insertPageTitle = vi.spyOn(ctx.utils.util, 'insertPageTitle').mockResolvedValue(undefined);
        checkDuplicateBookmarkUrl = vi
            .spyOn(ctx.utils.util, 'checkDuplicateBookmarkUrl')
            .mockResolvedValue(null);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('unauthenticated', () => {
        it('should redirect to google when !g is used', async () => {
            const req = {
                logger: mockLogger(),
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

            await searchUtils.search({
                req,
                res,
                user: undefined as unknown as User,
                query: '!g python',
            });

            expect(res.status).toBe(200);
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'private, max-age=3600',
                    Vary: 'Cookie', // Vary by Cookie for user-specific results
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('https://www.google.com/search?q=python');
            expect(req.session.searchCount).toBe(1);
            expect(req.session.user).toBeUndefined();
        });

        it('should redirect to google when !g is used without a search term', async () => {
            const req = {
                logger: mockLogger(),
                session: {
                    searchCount: 0,
                },
            } as unknown as Request;

            const res = {
                status: 200,
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            isValidUrl.mockReturnValue(true);

            await searchUtils.search({ req, res, user: undefined as unknown as User, query: '!g' });

            expect(res.status).toBe(200);
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'public, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('https://www.google.com');
            expect(req.session.searchCount).toBe(1);
            expect(req.session.user).toBeUndefined();

            isValidUrl.mockReset();
        });

        it('should redirect ddg without a exclamation mark when !doesnotexistanywhere is used', async () => {
            const req = {
                logger: mockLogger(),
                session: {
                    searchCount: 0,
                },
            } as unknown as Request;

            const res = {
                status: 200,
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({ req, res, user: undefined, query: '!doesnotexistanywhere' });

            expect(res.status).toBe(200);
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'no-store', // Unknown bangs should not be cached
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
                logger: mockLogger(),
                session: {
                    searchCount: 0,
                },
            } as unknown as Request;

            const res = {
                status: 200,
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            isValidUrl.mockReturnValue(false);

            try {
                await searchUtils.search({ req, res, user: undefined, query: '!g' });

                expect(res.status).toBe(200);
                expect(res.set).toHaveBeenCalledWith(
                    expect.objectContaining({
                        'Cache-Control': 'private, max-age=3600',
                        Vary: 'Cookie',
                    }),
                );
                expect(res.redirect).toHaveBeenCalledWith('https://duckduckgo.com/?q=!g');
                expect(req.session.searchCount).toBe(1);
                expect(req.session.user).toBeUndefined();
            } finally {
                isValidUrl.mockReset();
            }
        });

        it('should redirect back with a warning when a user has reached to its 10th search', async () => {
            const req = {
                logger: mockLogger(),
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

            await searchUtils.search({ req, res, user: undefined, query: '!g python' });

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
                logger: mockLogger(),
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

            await searchUtils.search({ req, res, user: undefined, query: '!g python' });

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.set).toHaveBeenCalledWith({ 'Content-Type': 'text/html' });
            expect(res.send).toHaveBeenCalledWith(
                expect.stringContaining(
                    'You&#39;ve exceeded the search limit for unauthenticated users. Please log in for unlimited searches without delays.',
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

        it.skipIf(config.app.env === 'development')(
            'should have slow down the search when a user has reached more than 60 searches',
            async () => {
                const req = {
                    logger: mockLogger(),
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

                const processDelayedSpy = vi.mocked(searchUtils.processDelayedSearch);
                processDelayedSpy.mockResolvedValue(undefined);

                try {
                    await searchUtils.search({ req, res, user: undefined, query: '!g python' });

                    expect(processDelayedSpy).toHaveBeenCalled();

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
                    processDelayedSpy.mockRestore();
                }
            },
        );
    });

    describe('authenticated', () => {
        beforeAll(async () => {
            await db('reminders').del();
            await db('bookmarks').del();
            await db('bangs').del();
            await db('users').del();

            await db('users').insert({
                id: 1,
                username: 'Test User',
                email: 'test@example.com',
                is_admin: false,
                default_search_provider: 'duckduckgo',
            });

            await db('bangs').insert([
                {
                    user_id: 1,
                    trigger: '!custom',
                    name: 'Custom Search',
                    action_type: 'search',
                    url: 'https://example.com/search?q={{{s}}}',
                    hidden: false,
                },
                {
                    user_id: 1,
                    trigger: '!mysite',
                    name: 'My Site',
                    action_type: 'redirect',
                    url: 'https://mysite.com',
                    hidden: false,
                },
            ]);
        });

        afterAll(async () => {
            await db('reminders').del();
            await db('bookmarks').del();
            await db('bangs').del();
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
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({ req, res, user: testUser, query: '@settings' });
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'private, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('/settings');

            await searchUtils.search({ req, res, user: testUser, query: '@b' });
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'private, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('/bangs');
        });

        it('should handle uppercased direct commands', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({ req, res, user: testUser, query: '@NOTES' });
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'private, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('/notes');

            vi.mocked(res.redirect).mockClear();
            await searchUtils.search({ req, res, user: testUser, query: '@BM' });
            expect(res.redirect).toHaveBeenCalledWith('/bookmarks');
        });

        it('should handle direct commands with search terms for @notes', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({ req, res, user: testUser, query: '@notes search query' });
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'private, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('/notes?search=search%20query');

            vi.mocked(res.redirect).mockClear();
            await searchUtils.search({ req, res, user: testUser, query: '@note another query' });
            expect(res.redirect).toHaveBeenCalledWith('/notes?search=another%20query');

            vi.mocked(res.redirect).mockClear();
            await searchUtils.search({ req, res, user: testUser, query: '@n shorthand' });
            expect(res.redirect).toHaveBeenCalledWith('/notes?search=shorthand');
        });

        it('should handle direct commands with search terms for @bookmarks', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({
                req,
                res,
                user: testUser,
                query: '@bookmarks search query',
            });
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'private, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('/bookmarks?search=search%20query');

            vi.mocked(res.redirect).mockClear();
            await searchUtils.search({ req, res, user: testUser, query: '@bm bookmark query' });
            expect(res.redirect).toHaveBeenCalledWith('/bookmarks?search=bookmark%20query');
        });

        it('should handle direct commands with search terms for @actions', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({ req, res, user: testUser, query: '@actions search query' });
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'private, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('/actions?search=search%20query');

            vi.mocked(res.redirect).mockClear();
            await searchUtils.search({ req, res, user: testUser, query: '@a action query' });
            expect(res.redirect).toHaveBeenCalledWith('/actions?search=action%20query');
        });

        it('should handle special characters in search terms', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({
                req,
                res,
                user: testUser,
                query: '@notes test & special + characters?',
            });
            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'private, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith(
                '/notes?search=test%20%26%20special%20%2B%20characters%3F',
            );
        });

        it('should handle bookmark creation with title', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
                setHeader: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            isValidUrl.mockReturnValue(true);

            const query = '!bm My Bookmark https://example.com';

            await searchUtils.search({
                req,
                res,
                user: testUser,
                query,
            });

            await vi.waitFor(() => expect(insertBookmark).toHaveBeenCalled());

            expect(insertBookmark).toHaveBeenCalledWith({
                url: 'https://example.com',
                title: 'My Bookmark',
                userId: 1,
                hidden: false,
            });

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'no-store',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('https://example.com');

            vi.restoreAllMocks();
        });

        it('should handle bookmark creation without title', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
                setHeader: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            isValidUrl.mockReturnValue(true);

            const query = '!bm https://example.com';

            await searchUtils.search({
                req,
                res,
                user: testUser,
                query,
            });

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'no-store',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('https://example.com');
        });

        it('should handle invalid bookmark URLs', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                set: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({
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

        it('should reject bookmark creation with title longer than 255 characters', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                set: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            isValidUrl.mockReturnValue(true);

            const longTitle = 'A'.repeat(256);
            const query = `!bm ${longTitle} https://example.com`;

            await searchUtils.search({
                req,
                res,
                user: testUser,
                query,
            });

            expect(res.status).toHaveBeenCalledWith(422);
            expect(res.send).toHaveBeenCalledWith(
                expect.stringContaining('Title must be shorter than 255 characters'),
            );

            isValidUrl.mockReset();
        });

        describe('!bm command with --hide flag', () => {
            afterEach(async () => {
                await db('bookmarks').where({ user_id: testUser.id }).delete();
                vi.restoreAllMocks();
            });

            it('should create hidden bookmark with --hide flag when global password is set', async () => {
                const userWithPassword = {
                    ...testUser,
                    hidden_items_password: 'hashed_password',
                };

                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    redirect: vi.fn(),
                    set: vi.fn(),
                } as unknown as Response;

                isValidUrl.mockReturnValue(true);

                await searchUtils.search({
                    req,
                    res,
                    user: userWithPassword,
                    query: '!bm Secret Site https://secret.com --hide',
                });

                await vi.waitFor(() => expect(insertBookmark).toHaveBeenCalled());

                expect(insertBookmark).toHaveBeenCalledWith({
                    url: 'https://secret.com',
                    title: 'Secret Site',
                    userId: 1,
                    hidden: true,
                });

                expect(res.redirect).toHaveBeenCalledWith('https://secret.com');
            });

            it('should reject hidden bookmark creation without global password', async () => {
                const userWithoutPassword = {
                    ...testUser,
                    hidden_items_password: null,
                };

                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                isValidUrl.mockReturnValue(true);

                await searchUtils.search({
                    req,
                    res,
                    user: userWithoutPassword,
                    query: '!bm Secret Site https://secret.com --hide',
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining(
                        'You must set a global password in settings before hiding items',
                    ),
                );
            });

            it('should handle --hide flag with URL only (no title)', async () => {
                const userWithPassword = {
                    ...testUser,
                    hidden_items_password: 'hashed_password',
                };

                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    redirect: vi.fn(),
                    set: vi.fn(),
                } as unknown as Response;

                isValidUrl.mockReturnValue(true);
                await searchUtils.search({
                    req,
                    res,
                    user: userWithPassword,
                    query: '!bm https://secret.com --hide',
                });

                await vi.waitFor(() => expect(insertBookmark).toHaveBeenCalled());

                expect(insertBookmark).toHaveBeenCalledWith({
                    url: 'https://secret.com',
                    title: '',
                    userId: 1,
                    hidden: true,
                });

                expect(res.redirect).toHaveBeenCalledWith('https://secret.com');
            });

            it('should remove --hide flag from bookmark title', async () => {
                const userWithPassword = {
                    ...testUser,
                    hidden_items_password: 'hashed_password',
                };

                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    redirect: vi.fn(),
                    set: vi.fn(),
                } as unknown as Response;

                isValidUrl.mockReturnValue(true);

                await searchUtils.search({
                    req,
                    res,
                    user: userWithPassword,
                    query: '!bm Title with --hide in middle https://example.com',
                });

                await vi.waitFor(() => expect(insertBookmark).toHaveBeenCalled());

                expect(insertBookmark).toHaveBeenCalledWith({
                    url: 'https://example.com',
                    title: 'Title with in middle', // --hide removed from title
                    userId: 1,
                    hidden: true,
                });
            });
        });

        it('should handle custom bang creation', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                set: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({
                req,
                res,
                user: testUser,
                query: '!add !new https://newsite.com',
            });

            expect(res.status).toHaveBeenCalledWith(200);
            expect(res.send).toHaveBeenCalledWith(expect.stringContaining('window.history.back()'));
        });

        describe('!add command with --hide flag', () => {
            afterEach(async () => {
                await db('bangs').where({ user_id: testUser.id }).delete();
            });

            it('should create hidden redirect action with --hide flag when global password is set', async () => {
                const userWithPassword = {
                    ...testUser,
                    hidden_items_password: 'hashed_password',
                };

                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: userWithPassword,
                    query: '!add !secret https://secret.com Secret Site --hide',
                });

                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('window.history.back()'),
                );

                const createdAction = await db('bangs')
                    .where({ user_id: userWithPassword.id, trigger: '!secret' })
                    .first();
                expect(createdAction).toBeDefined();
                expect(createdAction.hidden).toBe(1);
                expect(createdAction.action_type).toBe('redirect');
                expect(createdAction.name).toBe('Fetching title...'); // Actions are created with placeholder name
            });

            it('should reject hidden action creation without global password', async () => {
                const userWithoutPassword = {
                    ...testUser,
                    hidden_items_password: null,
                };

                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: userWithoutPassword,
                    query: '!add !secret https://secret.com Secret Site --hide',
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining(
                        'You must set a global password in settings before hiding items',
                    ),
                );

                const createdAction = await db('bangs')
                    .where({ user_id: userWithoutPassword.id, trigger: '!secret' })
                    .first();
                expect(createdAction).toBeUndefined();
            });

            it('should create hidden action regardless of URL pattern (no search/redirect validation)', async () => {
                const userWithPassword = {
                    ...testUser,
                    hidden_items_password: 'hashed_password',
                };

                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: userWithPassword,
                    query: '!add !secretsearch https://example.com/search?q=%s --hide',
                });

                // Currently, the code doesn't validate search vs redirect for hidden actions
                // All actions created with !add are marked as 'redirect' type
                expect(res.status).toHaveBeenCalledWith(200);

                const createdAction = await db('bangs')
                    .where({ user_id: userWithPassword.id, trigger: '!secretsearch' })
                    .first();
                expect(createdAction).toBeDefined();
                expect(createdAction.hidden).toBe(1);
                expect(createdAction.action_type).toBe('redirect'); // Always 'redirect' for !add
            });

            it('should remove --hide flag from action name', async () => {
                const userWithPassword = {
                    ...testUser,
                    hidden_items_password: 'hashed_password',
                };

                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: userWithPassword,
                    query: '!add !test https://example.com Name with --hide in middle',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdAction = await db('bangs')
                    .where({ user_id: userWithPassword.id, trigger: '!test' })
                    .first();
                expect(createdAction).toBeDefined();
                expect(createdAction.hidden).toBe(1);
                expect(createdAction.name).toBe('Fetching title...'); // Actions are created with placeholder name
            });
        });

        it('should handle custom search bang', async () => {
            await db('users')
                .insert({
                    id: 1,
                    username: 'Test User',
                    email: 'test@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                })
                .onConflict('id')
                .ignore();

            await db('bangs')
                .insert({
                    user_id: 1,
                    trigger: '!custom',
                    name: 'Custom Search',
                    action_type: 'search',
                    url: 'https://example.com/search?q={{{s}}}',
                    hidden: false,
                })
                .onConflict(['user_id', 'trigger'])
                .ignore();

            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({
                req,
                res,
                user: testUser,
                query: '!custom test search',
            });

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'no-store', // Custom bangs should not be cached
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('https://example.com/search?q=test%20search');
        });

        it('should handle custom search bang with {query} placeholder', async () => {
            await db('bangs').insert({
                user_id: 1,
                trigger: '!querytest',
                name: 'Query Test Search',
                action_type: 'search',
                url: 'https://query-example.com/search?q={query}',
            });

            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({
                req,
                res,
                user: testUser,
                query: '!querytest test search',
            });

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'no-store', // Custom bangs should not be cached
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
                action_type: 'search',
                url: 'https://s-example.com/search?q={{{s}}}',
            });

            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({
                req,
                res,
                user: testUser,
                query: '!stest test search',
            });

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'no-store', // Custom bangs should not be cached
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith(
                'https://s-example.com/search?q=test%20search',
            );

            await db('bangs').where({ trigger: '!stest', user_id: 1 }).delete();
        });

        it('should handle custom redirect bang', async () => {
            // Ensure the user and bang exist for this specific test
            await db('users')
                .insert({
                    id: 1,
                    username: 'Test User',
                    email: 'test@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                })
                .onConflict('id')
                .ignore();

            await db('bangs')
                .insert({
                    user_id: 1,
                    trigger: '!mysite',
                    name: 'My Site',
                    action_type: 'redirect',
                    url: 'https://mysite.com',
                    hidden: false,
                })
                .onConflict(['user_id', 'trigger'])
                .ignore();
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({
                req,
                res,
                user: testUser,
                query: '!mysite',
            });

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'no-store', // Custom bangs should not be cached
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('https://mysite.com');
        });

        it('should use default search provider when no bang matches', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({
                req,
                res,
                user: testUser,
                query: 'test search',
            });

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'private, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('https://duckduckgo.com/?q=test%20search');
        });

        it('should handle non-existent bang as search term', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({
                req,
                res,
                user: testUser,
                query: '!nonexistent',
            });

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'no-store', // Unknown bangs should not be cached
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('https://duckduckgo.com/?q=nonexistent');
        });

        it('should handle duplicate bang trigger creation', async () => {
            // Ensure the user and bang exist for this specific test
            await db('users')
                .insert({
                    id: 1,
                    username: 'Test User',
                    email: 'test@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                })
                .onConflict('id')
                .ignore();

            await db('bangs')
                .insert({
                    user_id: 1,
                    trigger: '!custom',
                    name: 'Custom Search',
                    action_type: 'search',
                    url: 'https://example.com/search?q={{{s}}}',
                    hidden: false,
                })
                .onConflict(['user_id', 'trigger'])
                .ignore();
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({
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
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                set: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({
                req,
                res,
                user: testUser,
                query: '!add !bm https://newsite.com',
            });

            expect(res.status).toHaveBeenCalledWith(422);
            expect(res.send).toHaveBeenCalledWith(
                expect.stringContaining('!bm is a bang&#39;s systems command'),
            );
        });

        it('should handle malformed !add command', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                set: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({
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
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
                setHeader: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            const mockInsertBookmark = vi.fn().mockResolvedValue(undefined);

            isValidUrl.mockReturnValue(true);
            insertBookmark.mockImplementation(mockInsertBookmark);

            await searchUtils.search({
                req,
                res,
                user: testUser,
                query: '!bm This is a very long title https://example.com',
            });

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'no-store',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith('https://example.com');

            vi.restoreAllMocks();
        });

        it('should handle !add with implicit bang prefix', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                set: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({
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

            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            await searchUtils.search({
                req,
                res,
                user: googleUser,
                query: 'test search',
            });

            expect(res.set).toHaveBeenCalledWith(
                expect.objectContaining({
                    'Cache-Control': 'private, max-age=3600',
                }),
            );
            expect(res.redirect).toHaveBeenCalledWith(
                'https://www.google.com/search?q=test%20search',
            );
        });

        it('should handle bookmark creation errors', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                set: vi.fn().mockReturnThis(),
                status: vi.fn().mockReturnThis(),
                send: vi.fn(),
                redirect: vi.fn(),
            } as unknown as Response;

            isValidUrl.mockReturnValue(true);
            checkDuplicateBookmarkUrl.mockRejectedValue(new Error('Database error'));

            await searchUtils.search({
                req,
                res,
                user: testUser,
                query: '!bm title https://example.com',
            });

            expect(res.send).toHaveBeenCalledWith(
                expect.stringContaining(
                    'Failed to add bookmark. Please check the URL and try again.',
                ),
            );

            vi.resetModules();
        });

        describe('!note command', () => {
            afterEach(async () => {
                await db('notes').where({ user_id: testUser.id }).delete();
            });

            it('should create note with title and content using pipe format', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!note My Note Title | This is the content of the note',
                });

                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('window.history.back()'),
                );

                const createdNote = await db('notes')
                    .where({ user_id: testUser.id, title: 'My Note Title' })
                    .first();
                expect(createdNote).toBeDefined();
                expect(createdNote.content).toBe('This is the content of the note');
            });

            it('should create note with just content (no title)', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!note This is just content without a title',
                });

                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('window.history.back()'),
                );

                const createdNote = await db('notes')
                    .where({ user_id: testUser.id, title: 'Untitled' })
                    .first();
                expect(createdNote).toBeDefined();
                expect(createdNote.content).toBe('This is just content without a title');
            });

            it('should create notes with pinned defaulting to false', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!note Test Note | Test content',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdNote = await db('notes')
                    .where({ user_id: testUser.id, title: 'Test Note' })
                    .first();
                expect(createdNote).toBeDefined();
                expect(createdNote.pinned).toBe(0); // SQLite stores boolean as 0/1
            });

            it('should reject note creation with title longer than 255 characters', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                const longTitle = 'A'.repeat(256);
                const query = `!note ${longTitle} | This is the content`;

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query,
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('Title must be shorter than 255 characters'),
                );

                const createdNote = await db('notes').where({ user_id: testUser.id }).first();
                expect(createdNote).toBeUndefined();
            });

            it('should handle note creation with empty content after pipe', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!note My Title |',
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('Content is required'),
                );
            });

            it('should handle note creation with empty content after pipe (whitespace only)', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!note My Title |   ',
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('Content is required'),
                );
            });

            it('should reject note creation with no content', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!note',
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('Content is required'),
                );
            });

            it('should reject note creation with only whitespace content', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!note   ',
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('Content is required'),
                );
            });

            it('should handle note creation with special characters in title and content', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!note Special @#$% Title | Content with special chars: !@#$%^&*()',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdNote = await db('notes')
                    .where({ user_id: testUser.id, title: 'Special @#$% Title' })
                    .first();
                expect(createdNote).toBeDefined();
                expect(createdNote.content).toBe('Content with special chars: !@#$%^&*()');
            });

            it('should handle note creation with multiple pipes (only first pipe is used as separator)', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!note Title with | pipe | Content also has | more pipes',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdNote = await db('notes')
                    .where({ user_id: testUser.id, title: 'Title with' })
                    .first();
                expect(createdNote).toBeDefined();
                expect(createdNote.content).toBe('pipe | Content also has | more pipes');
            });

            it('should sort pinned notes at the top', async () => {
                // Create multiple notes via search
                const queries = [
                    '!note First Note | First content',
                    '!note Second Note | Second content',
                    '!note Third Note | Third content',
                ];

                for (const query of queries) {
                    const req = { logger: mockLogger() } as unknown as Request;
                    const res = {
                        set: vi.fn().mockReturnThis(),
                        status: vi.fn().mockReturnThis(),
                        send: vi.fn(),
                    } as unknown as Response;

                    await searchUtils.search({ req, res, user: testUser, query });
                }

                // Pin the second note (created in middle)
                await db('notes')
                    .where({ user_id: testUser.id, title: 'Second Note' })
                    .update({ pinned: true });

                // Get all notes using repository
                const result = await ctx.models.notes.all({
                    user: testUser,
                    perPage: 10,
                    page: 1,
                    search: '',
                    sortKey: 'created_at',
                    direction: 'desc',
                });

                expect(result.data).toHaveLength(3);
                expect(result.data[0].title).toBe('Second Note'); // Pinned note should be first
                expect(result.data[0].pinned).toBe(1); // SQLite stores boolean as 0/1

                // Other notes should follow in creation order (newest first)
                expect(result.data[1].title).toBe('Third Note');
                expect(result.data[2].title).toBe('First Note');
            });

            describe('--hide flag', () => {
                beforeEach(async () => {
                    await db('users').where({ id: testUser.id }).update({
                        hidden_items_password: '$2b$10$test-hash', // Mock bcrypt hash
                    });
                });

                afterEach(async () => {
                    await db('users').where({ id: testUser.id }).update({
                        hidden_items_password: null,
                    });
                });

                it('should create hidden note with --hide flag when global password is set', async () => {
                    const userWithPassword = {
                        ...testUser,
                        hidden_items_password: '$2b$10$test-hash',
                    } as User;

                    const req = { logger: mockLogger() } as unknown as Request;
                    const res = {
                        set: vi.fn().mockReturnThis(),
                        status: vi.fn().mockReturnThis(),
                        send: vi.fn(),
                    } as unknown as Response;

                    await searchUtils.search({
                        req,
                        res,
                        user: userWithPassword,
                        query: '!note Hidden Note | Secret content --hide',
                    });

                    expect(res.status).toHaveBeenCalledWith(200);
                    expect(res.send).toHaveBeenCalledWith(
                        expect.stringContaining('window.history.back()'),
                    );

                    const createdNote = await db('notes')
                        .where({ user_id: testUser.id, title: 'Hidden Note' })
                        .first();
                    expect(createdNote).toBeDefined();
                    expect(createdNote.content).toBe('Secret content');
                    expect(createdNote.hidden).toBe(1); // SQLite stores boolean as 0/1
                });

                it('should reject hidden note creation without global password', async () => {
                    const userWithoutPassword = {
                        ...testUser,
                        hidden_items_password: null,
                    } as User;

                    const req = { logger: mockLogger() } as unknown as Request;
                    const res = {
                        set: vi.fn().mockReturnThis(),
                        status: vi.fn().mockReturnThis(),
                        send: vi.fn(),
                    } as unknown as Response;

                    await searchUtils.search({
                        req,
                        res,
                        user: userWithoutPassword,
                        query: '!note Hidden Note | Secret content --hide',
                    });

                    expect(res.status).toHaveBeenCalledWith(422);
                    expect(res.send).toHaveBeenCalledWith(
                        expect.stringContaining(
                            'You must set a global password in settings before hiding items',
                        ),
                    );

                    const createdNote = await db('notes')
                        .where({ user_id: testUser.id, title: 'Hidden Note' })
                        .first();
                    expect(createdNote).toBeUndefined();
                });

                it('should handle --hide flag in middle of content', async () => {
                    const userWithPassword = {
                        ...testUser,
                        hidden_items_password: '$2b$10$test-hash',
                    } as User;

                    const req = { logger: mockLogger() } as unknown as Request;
                    const res = {
                        set: vi.fn().mockReturnThis(),
                        status: vi.fn().mockReturnThis(),
                        send: vi.fn(),
                    } as unknown as Response;

                    await searchUtils.search({
                        req,
                        res,
                        user: userWithPassword,
                        query: '!note Test Note | Content with --hide flag in middle',
                    });

                    expect(res.status).toHaveBeenCalledWith(200);

                    const createdNote = await db('notes')
                        .where({ user_id: testUser.id, title: 'Test Note' })
                        .first();
                    expect(createdNote).toBeDefined();
                    expect(createdNote.content).toBe('Content with  flag in middle'); // --hide removed leaves double space
                    expect(createdNote.hidden).toBe(1);
                });
            });
        });

        describe('!del command', () => {
            beforeAll(async () => {
                await db('bangs').insert({
                    id: 999,
                    user_id: 1,
                    trigger: '!deleteme',
                    name: 'Delete Test',
                    action_type: 'redirect',
                    url: 'https://delete-test.com',
                });
            });

            afterAll(async () => {
                await db('bangs').where({ id: 999 }).delete();
            });

            it('should successfully delete an existing bang', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
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
                    action_type: 'redirect',
                    url: 'https://delete-test2.com',
                });

                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
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
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!del !nonexistent',
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining(
                        'Bang &#39;!nonexistent&#39; not found or you don&#39;t have permission to delete it',
                    ),
                );
            });

            it('should return error when no trigger is provided', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
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
                    logger: mockLogger(),
                    session: {} as SessionData,
                } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    redirect: vi.fn(),
                } as unknown as Response;

                const unauthenticatedUser = { ...testUser, id: undefined } as unknown as User;

                await searchUtils.search({
                    req,
                    res,
                    user: unauthenticatedUser,
                    query: '!del !test',
                });

                expect(res.set).toHaveBeenCalledWith(
                    expect.objectContaining({
                        'Cache-Control': 'no-store', // Unknown bangs should not be cached
                    }),
                );
                expect(res.redirect).toHaveBeenCalledWith(
                    expect.stringContaining('duckduckgo.com'),
                );
            });

            it('should successfully delete an existing tab only', async () => {
                await db('tabs').insert({
                    id: 2000,
                    user_id: 1,
                    trigger: '!tabonly',
                    title: 'Tab Only Test',
                    created_at: dayjs().toDate(),
                    updated_at: dayjs().toDate(),
                });

                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!del !tabonly',
                });

                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('window.history.back()'),
                );

                const deletedTab = await db('tabs')
                    .where({ user_id: 1, trigger: '!tabonly' })
                    .first();
                expect(deletedTab).toBeUndefined();

                await db('tabs').where({ id: 2000 }).delete();
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
                        action_type: 'redirect',
                        url: 'https://edit-test.com',
                    },
                    {
                        id: 1002,
                        user_id: 1,
                        trigger: '!existing',
                        name: 'Existing Bang',
                        action_type: 'redirect',
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
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
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
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!edit !editme https://new-url.com',
                });

                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('window.history.back()'),
                );

                await vi.waitFor(() => expect(insertPageTitle).toHaveBeenCalled());

                expect(insertPageTitle).toHaveBeenCalledWith({
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
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                isValidUrl.mockReturnValue(true);

                const mockInsertPageTitle = vi.fn().mockResolvedValue(undefined);
                insertPageTitle.mockImplementation(mockInsertPageTitle);

                await searchUtils.search({
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
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!edit !nonexistent !newtrigger',
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining(
                        '!nonexistent not found or you don&#39;t have permission to edit it',
                    ),
                );
            });

            it('should return error with invalid format', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
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
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
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
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
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
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                isValidUrl.mockReturnValue(false);

                await searchUtils.search({
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
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
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
                    logger: mockLogger(),
                    session: {} as SessionData,
                } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    redirect: vi.fn(),
                } as unknown as Response;

                const unauthenticatedUser = { ...testUser, id: undefined } as unknown as User;

                await searchUtils.search({
                    req,
                    res,
                    user: unauthenticatedUser,
                    query: '!edit !test !newtrigger',
                });

                expect(res.set).toHaveBeenCalledWith(
                    expect.objectContaining({
                        'Cache-Control': 'no-store', // Unknown bangs should not be cached
                    }),
                );
                expect(res.redirect).toHaveBeenCalledWith(
                    expect.stringContaining('duckduckgo.com'),
                );
            });

            it('should handle editing with trigger without ! prefix', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                isValidUrl.mockReturnValue(true);

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!edit editme https://new-without-prefix.com', // No ! prefix on editme
                });

                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('window.history.back()'),
                );

                const updatedBang = await db('bangs')
                    .where({ user_id: 1, trigger: '!editme' })
                    .first();
                expect(updatedBang).toBeDefined();
                expect(updatedBang.url).toBe('https://new-without-prefix.com');

                isValidUrl.mockReset();
            });

            it('should successfully edit an existing tab trigger', async () => {
                // Create a tab without a corresponding bang
                await db('tabs').insert({
                    id: 3000,
                    user_id: 1,
                    trigger: '!edittab',
                    title: 'Edit Tab Test',
                    created_at: dayjs().toDate(),
                    updated_at: dayjs().toDate(),
                });

                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!edit !edittab !newtab',
                });

                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('window.history.back()'),
                );

                // Verify the tab trigger was updated
                const updatedTab = await db('tabs')
                    .where({ user_id: 1, trigger: '!newtab' })
                    .first();
                expect(updatedTab).toBeDefined();
                expect(updatedTab.title).toBe('Edit Tab Test');

                // Verify old trigger no longer exists
                const oldTab = await db('tabs').where({ user_id: 1, trigger: '!edittab' }).first();
                expect(oldTab).toBeUndefined();

                // Clean up
                await db('tabs').where({ id: 3000 }).delete();
            });
        });

        it('should handle all direct navigation commands', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            const commands = {
                '@a': '/actions',
                '@actions': '/actions',
                '@api': '/api-docs',
                '@b': '/bangs',
                '@bang': '/bangs',
                '@bm': '/bookmarks',
                '@bookmarks': '/bookmarks',
                '@data': '/settings/data',
                '@s': '/settings',
                '@settings': '/settings',
            };

            for (const [command, path] of Object.entries(commands)) {
                await searchUtils.search({ req, res, user: testUser, query: command });
                expect(res.set).toHaveBeenCalledWith(
                    expect.objectContaining({
                        'Cache-Control': 'private, max-age=3600',
                    }),
                );
                expect(res.redirect).toHaveBeenCalledWith(path);
            }
        });

        it('should not redirect to bang service homepage when bang has invalid URL for authenticated bang-only queries', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            isValidUrl.mockReturnValue(false);

            try {
                await searchUtils.search({ req, res, user: testUser, query: '!g' });

                expect(res.set).toHaveBeenCalledWith(
                    expect.objectContaining({
                        'Cache-Control': 'private, max-age=3600',
                    }),
                );
                // When bang URL is invalid, fall back to searching for trigger without the "!"
                expect(res.redirect).toHaveBeenCalledWith('https://duckduckgo.com/?q=g');
            } finally {
                vi.restoreAllMocks();
            }
        });

        describe('duplicate bookmark detection', () => {
            beforeEach(async () => {
                await db('bookmarks').del();
                await db('bookmarks').insert({
                    id: 999,
                    user_id: 1,
                    title: 'Existing Bookmark',
                    url: 'https://existing.com',
                    created_at: dayjs().toDate(),
                    updated_at: dayjs().toDate(),
                });
            });

            afterEach(async () => {
                await db('bookmarks').del();
            });

            it('should detect duplicate URL and show error with title', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                isValidUrl.mockReturnValue(true);
                checkDuplicateBookmarkUrl.mockResolvedValue({
                    id: 999,
                    user_id: 1,
                    title: 'Existing Bookmark',
                    url: 'https://existing.com',
                    created_at: dayjs().toISOString(),
                });

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!bm New Title https://existing.com',
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining(
                        'URL already bookmarked as Existing Bookmark. Use a different URL or update the existing bookmark.',
                    ),
                );

                isValidUrl.mockReset();
                checkDuplicateBookmarkUrl.mockReset();
            });

            it('should detect duplicate URL and show error without title', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                isValidUrl.mockReturnValue(true);
                checkDuplicateBookmarkUrl.mockResolvedValue({
                    id: 999,
                    user_id: 1,
                    title: 'Existing Bookmark',
                    url: 'https://existing.com',
                    created_at: dayjs().toISOString(),
                });

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!bm https://existing.com',
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining(
                        'URL already bookmarked as Existing Bookmark. Bookmark already exists.',
                    ),
                );

                isValidUrl.mockReset();
                checkDuplicateBookmarkUrl.mockReset();
            });

            it('should handle bookmark titles with special characters in duplicate detection', async () => {
                // Insert bookmark with special characters
                await db('bookmarks').where({ id: 999 }).update({
                    title: 'Test "Quotes" & Special Chars',
                });

                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                isValidUrl.mockReturnValue(true);
                checkDuplicateBookmarkUrl.mockResolvedValue({
                    id: 999,
                    user_id: 1,
                    title: 'Test "Quotes" & Special Chars',
                    url: 'https://existing.com',
                    created_at: dayjs().toISOString(),
                });

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!bm https://existing.com',
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining(
                        'URL already bookmarked as Test &quot;Quotes&quot; &amp; Special Chars. Bookmark already exists.',
                    ),
                );

                isValidUrl.mockReset();
                checkDuplicateBookmarkUrl.mockReset();
            });

            it('should allow bookmark creation with unique URL', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    redirect: vi.fn(),
                    set: vi.fn(),
                } as unknown as Response;

                isValidUrl.mockReturnValue(true);
                checkDuplicateBookmarkUrl.mockResolvedValue(null); // No duplicate found

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!bm Unique Title https://unique.com',
                });

                await vi.waitFor(() => expect(insertBookmark).toHaveBeenCalled());

                expect(insertBookmark).toHaveBeenCalledWith({
                    url: 'https://unique.com',
                    title: 'Unique Title',
                    userId: testUser.id,
                    hidden: false,
                });

                expect(res.set).toHaveBeenCalledWith(
                    expect.objectContaining({
                        'Cache-Control': 'no-store',
                    }),
                );
                expect(res.redirect).toHaveBeenCalledWith('https://unique.com');
            });

            it('should not check for duplicates for other users', async () => {
                const otherUser = {
                    ...testUser,
                    id: 2,
                } as User;

                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    redirect: vi.fn(),
                    set: vi.fn(),
                } as unknown as Response;

                isValidUrl.mockReturnValue(true);
                checkDuplicateBookmarkUrl.mockResolvedValue(null); // No duplicate found for other user

                await searchUtils.search({
                    req,
                    res,
                    user: otherUser,
                    query: '!bm Same URL https://existing.com', // Same URL as user 1's bookmark
                });

                await vi.waitFor(() => expect(insertBookmark).toHaveBeenCalled());

                expect(insertBookmark).toHaveBeenCalledWith({
                    url: 'https://existing.com',
                    title: 'Same URL',
                    userId: otherUser.id,
                    hidden: false,
                });

                expect(res.redirect).toHaveBeenCalledWith('https://existing.com');
            });

            it('should allow same URL with different title', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    redirect: vi.fn(),
                    set: vi.fn(),
                } as unknown as Response;

                isValidUrl.mockReturnValue(true);
                checkDuplicateBookmarkUrl.mockResolvedValue(null); // No duplicate because title is different

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!bm Different Title https://existing.com', // Same URL, different title
                });

                await vi.waitFor(() => expect(insertBookmark).toHaveBeenCalled());

                expect(insertBookmark).toHaveBeenCalledWith({
                    url: 'https://existing.com',
                    title: 'Different Title',
                    userId: testUser.id,
                    hidden: false,
                });

                expect(res.redirect).toHaveBeenCalledWith('https://existing.com');
            });

            it('should reject same URL with same title as duplicate', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                isValidUrl.mockReturnValue(true);
                checkDuplicateBookmarkUrl.mockResolvedValue({
                    id: 999,
                    user_id: 1,
                    title: 'Same Title',
                    url: 'https://existing.com',
                    created_at: dayjs().toISOString(),
                });

                await searchUtils.search({
                    req,
                    res,
                    user: testUser,
                    query: '!bm Same Title https://existing.com', // Same URL, same title
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining(
                        'URL already bookmarked as Same Title. Use a different URL or update the existing bookmark.',
                    ),
                );

                isValidUrl.mockReset();
                checkDuplicateBookmarkUrl.mockReset();
            });
        });

        describe('!remind command', () => {
            const testUserWithPreferences = {
                id: testUser.id,
                username: 'Test User',
                email: 'test@example.com',
                is_admin: false,
                default_search_provider: 'duckduckgo',
                column_preferences: {
                    reminders: {
                        default_reminder_timing: 'weekly',
                        default_reminder_time: '10:00',
                    },
                },
                timezone: 'America/New_York',
            } as User;

            beforeEach(async () => {
                // Clean up any existing reminders before each test
                await db('reminders').where({ user_id: testUser.id }).delete();
            });

            afterEach(async () => {
                // Clean up reminders after each test
                await db('reminders').where({ user_id: testUser.id }).delete();
            });

            it('should create reminder with default timing (simple format)', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                isValidUrl.mockRestore();

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind take out trash',
                });

                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('window.history.back()'),
                );

                const createdReminder = await db('reminders')
                    .where({ user_id: testUserWithPreferences.id, title: 'take out trash' })
                    .first();
                expect(createdReminder).toBeDefined();
                expect(createdReminder.reminder_type).toBe('recurring');
                expect(createdReminder.frequency).toBe('weekly');
            });

            it('should create reminder with timing keyword (space-separated format)', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind daily google.com',
                });

                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('window.history.back()'),
                );

                const createdReminder = await db('reminders')
                    .where({ user_id: testUserWithPreferences.id, title: 'Untitled' })
                    .first();
                expect(createdReminder).toBeDefined();
                expect(createdReminder.reminder_type).toBe('recurring');
                expect(createdReminder.frequency).toBe('daily');
                expect(createdReminder.content).toBe('google.com');
            });

            it('should create reminder with pipe-separated format', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind weekly | check bills | https://bank.com',
                });

                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('window.history.back()'),
                );

                const createdReminder = await db('reminders')
                    .where({ user_id: testUser.id, title: 'check bills' })
                    .first();
                expect(createdReminder).toBeDefined();
                expect(createdReminder.reminder_type).toBe('recurring');
                expect(createdReminder.frequency).toBe('weekly');
                expect(createdReminder.content).toBe('https://bank.com');
            });

            it('should create reminder with specific date', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind 2025-12-25 | christmas reminder',
                });

                expect(res.status).toHaveBeenCalledWith(200);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('window.history.back()'),
                );

                const createdReminder = await db('reminders')
                    .where({ user_id: testUser.id, title: 'christmas reminder' })
                    .first();
                expect(createdReminder).toBeDefined();
                expect(createdReminder.reminder_type).toBe('once');
                expect(createdReminder.frequency).toBeNull();
                expect(createdReminder.due_date).toBeDefined();
            });

            it('should handle all timing keywords', async () => {
                isValidUrl.mockRestore();
                const timingKeywords = ['daily', 'weekly', 'monthly'];

                for (const timing of timingKeywords) {
                    const req = { logger: mockLogger() } as unknown as Request;
                    const res = {
                        set: vi.fn().mockReturnThis(),
                        status: vi.fn().mockReturnThis(),
                        send: vi.fn(),
                    } as unknown as Response;

                    await searchUtils.search({
                        req,
                        res,
                        user: testUserWithPreferences,
                        query: `!remind ${timing} test ${timing} reminder`,
                    });

                    expect(res.status).toHaveBeenCalledWith(200);

                    const createdReminder = await db('reminders')
                        .where({
                            user_id: testUserWithPreferences.id,
                            title: `test ${timing} reminder`,
                        })
                        .first();
                    expect(createdReminder).toBeDefined();
                    expect(createdReminder.frequency).toBe(timing);
                }
            });

            it('should reject reminder with no content', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind',
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('Reminder content is required'),
                );
            });

            it('should reject reminder with empty description', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind daily |',
                });

                expect(res.status).toHaveBeenCalledWith(422);
                expect(res.send).toHaveBeenCalledWith(
                    expect.stringContaining('Description is required'),
                );
            });

            it('should treat invalid timing as description when not a valid keyword', async () => {
                isValidUrl.mockRestore();
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind invalid-timing test reminder',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdReminder = await db('reminders')
                    .where({
                        user_id: testUserWithPreferences.id,
                        title: 'invalid-timing test reminder',
                    })
                    .first();
                expect(createdReminder).toBeDefined();
                expect(createdReminder.frequency).toBe('weekly');
            });

            it('should handle user without preferences (fallback to defaults)', async () => {
                isValidUrl.mockRestore();
                const userWithoutPrefs = {
                    id: 1,
                    username: 'Test User',
                    email: 'test@example.com',
                    is_admin: false,
                    default_search_provider: 'duckduckgo',
                    column_preferences: null,
                    timezone: null,
                } as unknown as User;

                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: userWithoutPrefs,
                    query: '!remind test reminder without prefs',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdReminder = await db('reminders')
                    .where({ user_id: 1, title: 'test reminder without prefs' })
                    .first();
                expect(createdReminder).toBeDefined();
                expect(createdReminder.frequency).toBe('daily'); // Default fallback
            });

            it('should handle reminder with URL in content', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind daily check website https://example.com',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdReminder = await db('reminders')
                    .where({ user_id: 1, title: 'check website' })
                    .first();
                expect(createdReminder).toBeDefined();
                expect(createdReminder.frequency).toBe('daily');
                expect(createdReminder.content).toBe('https://example.com');
            });

            it('should detect URL as description without pipe (daily timing)', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind daily google.com',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdReminder = await db('reminders')
                    .where({ user_id: 1, title: 'Untitled' })
                    .first();
                expect(createdReminder).toBeDefined();
                expect(createdReminder.frequency).toBe('daily');
                expect(createdReminder.content).toBe('google.com');
            });

            it('should detect URL as description without pipe (weekly timing)', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind weekly https://example.com',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdReminder = await db('reminders')
                    .where({ user_id: 1, title: 'Untitled' })
                    .first();
                expect(createdReminder).toBeDefined();
                expect(createdReminder.frequency).toBe('weekly');
                expect(createdReminder.content).toBe('https://example.com');
            });

            it('should detect URL as description with default timing', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind https://github.com',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdReminder = await db('reminders')
                    .where({ user_id: 1, title: 'Untitled' })
                    .first();
                expect(createdReminder).toBeDefined();
                expect(createdReminder.frequency).toBe('weekly');
                expect(createdReminder.content).toBe('https://github.com');
            });

            it('should split description and URL content when text precedes URL', async () => {
                isValidUrl.mockRestore();
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind title google.com',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdReminder = await db('reminders')
                    .where({ user_id: testUserWithPreferences.id, title: 'title' })
                    .first();
                expect(createdReminder).toBeDefined();
                expect(createdReminder.frequency).toBe('weekly');
                expect(createdReminder.content).toBe('google.com');
            });

            it('should split description and URL content with timing keyword', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind monthly check website https://example.com',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdReminder = await db('reminders')
                    .where({ user_id: 1, title: 'check website' })
                    .first();
                expect(createdReminder).toBeDefined();
                expect(createdReminder.frequency).toBe('monthly');
                expect(createdReminder.content).toBe('https://example.com');
            });

            it('should handle reminder with special characters', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind daily | special chars: !@#$%^&*() | content with symbols',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdReminder = await db('reminders')
                    .where({ user_id: 1, title: 'special chars: !@#$%^&*()' })
                    .first();
                expect(createdReminder).toBeDefined();
                expect(createdReminder.content).toBe('content with symbols');
            });

            it('should handle pipe format without timing keyword (uses default timing)', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind title | google',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdReminder = await db('reminders')
                    .where({ user_id: 1, title: 'title' })
                    .first();
                expect(createdReminder).toBeDefined();
                expect(createdReminder.frequency).toBe('weekly');
                expect(createdReminder.content).toBe('google');
            });

            it('should handle pipe format with URL as content', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind check website | https://example.com',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdReminder = await db('reminders')
                    .where({ user_id: 1, title: 'check website' })
                    .first();
                expect(createdReminder).toBeDefined();
                expect(createdReminder.frequency).toBe('weekly');
                expect(createdReminder.content).toBe('https://example.com');
            });

            it('should handle pipe format with timing and URL domain', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind daily title | google.com',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdReminder = await db('reminders')
                    .where({ user_id: 1, title: 'title' })
                    .first();
                expect(createdReminder).toBeDefined();
                expect(createdReminder.frequency).toBe('daily');
                expect(createdReminder.content).toBe('google.com');
            });

            it('should handle URL-only reminder with default timing and set title to Untitled', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                isValidUrl.mockReturnValue(true);

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind google.com',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdReminder = await db('reminders')
                    .where({ user_id: 1, title: 'Untitled' })
                    .first();
                expect(createdReminder).toBeDefined();
                expect(createdReminder.frequency).toBe('weekly');
                expect(createdReminder.content).toBe('google.com');

                isValidUrl.mockReset();
            });

            it('should handle URL-only reminder with https protocol and set title to Untitled', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                isValidUrl.mockReturnValue(true);

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind https://example.com',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdReminder = await db('reminders')
                    .where({ user_id: 1, title: 'Untitled' })
                    .first();
                expect(createdReminder).toBeDefined();
                expect(createdReminder.frequency).toBe('weekly');
                expect(createdReminder.content).toBe('https://example.com');

                isValidUrl.mockReset();
            });

            it('should call insertPageTitle for URL-only reminders', async () => {
                const req = { logger: mockLogger() } as unknown as Request;
                const res = {
                    set: vi.fn().mockReturnThis(),
                    status: vi.fn().mockReturnThis(),
                    send: vi.fn(),
                } as unknown as Response;

                isValidUrl.mockReturnValue(true);

                await searchUtils.search({
                    req,
                    res,
                    user: testUserWithPreferences,
                    query: '!remind https://example.com',
                });

                expect(res.status).toHaveBeenCalledWith(200);

                const createdReminder = await db('reminders')
                    .where({ user_id: 1, title: 'Untitled' })
                    .first();
                expect(createdReminder).toBeDefined();

                await vi.waitFor(() => expect(insertPageTitle).toHaveBeenCalled());

                expect(insertPageTitle).toHaveBeenCalledWith({
                    reminderId: createdReminder.id,
                    url: 'https://example.com',
                    req,
                });
            });
        });
    });
});

describe('parseSearchQuery', () => {
    it('should parse basic queries correctly', () => {
        const result = searchUtils.parseSearchQuery('test query');
        expect(result).toEqual({
            commandType: null,
            trigger: null,
            triggerWithoutPrefix: null,
            url: null,
            searchTerm: 'test query',
        });
    });

    it('should parse bangs correctly', () => {
        const result = searchUtils.parseSearchQuery('!g test query');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!g',
            triggerWithoutPrefix: 'g',
            url: null,
            searchTerm: 'test query',
        });
    });

    it('should parse direct commands correctly', () => {
        const result = searchUtils.parseSearchQuery('@settings');
        expect(result).toEqual({
            commandType: 'direct',
            trigger: '@settings',
            triggerWithoutPrefix: 'settings',
            url: null,
            searchTerm: '',
        });
    });

    it('should handle bookmark commands', () => {
        const result = searchUtils.parseSearchQuery('bm:homepage');
        expect(result).toEqual({
            commandType: null,
            trigger: null,
            triggerWithoutPrefix: null,
            url: null,
            searchTerm: 'bm:homepage',
        });
    });

    it('should handle URLs only in bang commands', () => {
        const result = searchUtils.parseSearchQuery('!bm My Bookmark https://www.example.com');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!bm',
            triggerWithoutPrefix: 'bm',
            url: 'https://www.example.com',
            searchTerm: 'My Bookmark',
        });
    });

    it('should not detect URLs in regular searches', () => {
        const result = searchUtils.parseSearchQuery('https://www.example.com');
        expect(result).toEqual({
            commandType: null,
            trigger: null,
            triggerWithoutPrefix: null,
            url: null,
            searchTerm: 'https://www.example.com',
        });
    });

    it('should detect URLs with special characters in bang commands', () => {
        const result = searchUtils.parseSearchQuery(
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
        const result = searchUtils.parseSearchQuery('!bm Title https://example.com/page#section1');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!bm',
            triggerWithoutPrefix: 'bm',
            url: 'https://example.com/page#section1',
            searchTerm: 'Title',
        });
    });

    it('should detect URLs with port numbers in bang commands', () => {
        const result = searchUtils.parseSearchQuery('!bm Dev https://localhost:3000/api/data');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!bm',
            triggerWithoutPrefix: 'bm',
            url: 'https://localhost:3000/api/data',
            searchTerm: 'Dev',
        });
    });

    it('should parse commands with numbers', () => {
        const result = searchUtils.parseSearchQuery('!123 test');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!123',
            triggerWithoutPrefix: '123',
            url: null,
            searchTerm: 'test',
        });
    });

    it('should parse commands with underscores', () => {
        const result = searchUtils.parseSearchQuery('!my_command test');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!my_command',
            triggerWithoutPrefix: 'my_command',
            url: null,
            searchTerm: 'test',
        });
    });

    it('should parse commands with periods', () => {
        const result = searchUtils.parseSearchQuery('!my.command test');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!my.command',
            triggerWithoutPrefix: 'my.command',
            url: null,
            searchTerm: 'test',
        });
    });

    it('should handle multiple URLs in bang commands', () => {
        const result = searchUtils.parseSearchQuery(
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
        const result = searchUtils.parseSearchQuery('!bm FTP ftp://example.com/files');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!bm',
            triggerWithoutPrefix: 'bm',
            url: null,
            searchTerm: 'FTP ftp://example.com/files',
        });
    });

    it('should handle queries with special characters', () => {
        const result = searchUtils.parseSearchQuery('!g test@example.com');
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
        const result = searchUtils.parseSearchQuery(`!g ${longTerm}`);
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!g',
            triggerWithoutPrefix: 'g',
            url: null,
            searchTerm: longTerm,
        });
    });

    it('should handle direct commands with parameters', () => {
        const result = searchUtils.parseSearchQuery('@notes search: important meeting');
        expect(result).toEqual({
            commandType: 'direct',
            trigger: '@notes',
            triggerWithoutPrefix: 'notes',
            url: null,
            searchTerm: 'search: important meeting',
        });
    });

    it('should handle direct commands with special characters', () => {
        const result = searchUtils.parseSearchQuery('@tag:work');
        expect(result).toEqual({
            commandType: 'direct',
            trigger: '@tag:work',
            triggerWithoutPrefix: 'tag:work',
            url: null,
            searchTerm: '',
        });
    });

    it('should handle URL-like strings in bang commands', () => {
        const result = searchUtils.parseSearchQuery('!w https://en.wikipedia.org');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!w',
            triggerWithoutPrefix: 'w',
            url: 'https://en.wikipedia.org',
            searchTerm: '',
        });
    });

    it('should handle commands that look like URLs', () => {
        const result = searchUtils.parseSearchQuery('!http test');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!http',
            triggerWithoutPrefix: 'http',
            url: null,
            searchTerm: 'test',
        });
    });

    it('should handle empty search term with commands', () => {
        const result = searchUtils.parseSearchQuery('!g');
        expect(result).toEqual({
            commandType: 'bang',
            trigger: '!g',
            triggerWithoutPrefix: 'g',
            url: null,
            searchTerm: '',
        });
    });

    it('should handle whitespace-only search term', () => {
        const result = searchUtils.parseSearchQuery('!g    ');
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
        const req = { logger: mockLogger(), session: {} } as unknown as Request;

        const start = Date.now();
        await searchUtils.processDelayedSearch(req);
        const duration = Date.now() - start;

        expect(duration).toBeLessThan(10);
    });

    it('should delay for the specified time', async () => {
        const delayMs = 10;
        const req = {
            logger: mockLogger(),
            session: {
                cumulativeDelay: delayMs,
            },
        } as unknown as Request;

        const start = Date.now();
        await searchUtils.processDelayedSearch(req);
        const duration = Date.now() - start;

        expect(duration).toBeGreaterThanOrEqual(delayMs - 1);
    });

    it('should not block other operations while waiting', async () => {
        const delayMs = 20;
        const req = {
            logger: mockLogger(),
            session: {
                cumulativeDelay: delayMs,
            },
        } as unknown as Request;

        const delayPromise = searchUtils.processDelayedSearch(req);

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
    it('should track search history synchronously', async () => {
        const req = {
            logger: mockLogger(),
            session: {
                searchCount: 1,
            },
        } as unknown as Request;

        const res = {
            redirect: vi.fn(),
            set: vi.fn(),
        } as unknown as Response;

        const initialSearchCount = req.session.searchCount || 0;

        await searchUtils.handleAnonymousSearch(req, res, 'test query', 'g', 'test query');

        expect(req.session.searchCount).toBe(initialSearchCount + 1);
        expect(res.redirect).toHaveBeenCalled();
    });
});

describe('search command handling', () => {
    describe('bangs object access', () => {
        it('should provide fast access to bangs', async () => {
            const googleBang = searchUtils.getBangRedirectUrl(
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

        it('should handle Kagi bangs with relative URLs when search term is provided', () => {
            const kagiHtmlBang = searchUtils.getBangRedirectUrl(
                {
                    u: '/html/search?q={{{s}}}',
                    d: 'kagi.com',
                } as any,
                'python',
            );

            expect(kagiHtmlBang).toBe('/html/search?q=python');
        });

        it('should handle Kagi bangs with relative URLs when no search term is provided', () => {
            const kagiHtmlBang = searchUtils.getBangRedirectUrl(
                {
                    u: '/html/search?q={{{s}}}',
                    d: 'kagi.com',
                } as any,
                '',
            );

            expect(kagiHtmlBang).toBe('https://kagi.com/html/search?q=');
        });

        it('should fallback to domain for empty or invalid redirect URLs', () => {
            const invalidBang = searchUtils.getBangRedirectUrl(
                {
                    u: '',
                    d: 'example.com',
                } as any,
                '',
            );

            expect(invalidBang).toBe('https://example.com');
        });
    });

    describe('direct commands handling', () => {
        it('should handle direct commands with explicit commandType', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;

            const parseSearchQuerySpy = vi.spyOn(searchUtils, 'parseSearchQuery').mockReturnValue({
                commandType: 'direct',
                trigger: '@notes',
                triggerWithoutPrefix: 'notes',
                url: null,
                searchTerm: 'test',
            });

            const user = { id: 1 } as User;

            await searchUtils.search({ req, res, user, query: '@notes test' });

            expect(res.redirect).toHaveBeenCalledWith('/notes?search=test');

            parseSearchQuerySpy.mockRestore();
        });
    });

    describe('search function with commandType', () => {
        it('should handle bang commandType with unknown bang', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;
            const user = {
                id: 1,
                default_search_provider: 'duckduckgo',
            } as User;

            const parseSearchQuerySpy = vi.spyOn(searchUtils, 'parseSearchQuery').mockReturnValue({
                commandType: 'bang',
                trigger: '!unknown',
                triggerWithoutPrefix: 'unknown',
                url: null,
                searchTerm: '',
            });

            await searchUtils.search({ req, res, user, query: '!unknown' });

            expect(res.redirect).toHaveBeenCalledWith('https://duckduckgo.com/?q=unknown');

            parseSearchQuerySpy.mockRestore();
        });

        it('should handle regular search with null commandType', async () => {
            const req = { logger: mockLogger() } as unknown as Request;
            const res = {
                redirect: vi.fn(),
                set: vi.fn(),
            } as unknown as Response;
            const user = {
                id: 1,
                default_search_provider: 'duckduckgo',
            } as User;

            const parseSearchQuerySpy = vi.spyOn(searchUtils, 'parseSearchQuery').mockReturnValue({
                commandType: null,
                trigger: null,
                triggerWithoutPrefix: null,
                url: null,
                searchTerm: 'regular search',
            });

            await searchUtils.search({ req, res, user, query: 'regular search' });

            expect(res.redirect).toHaveBeenCalledWith('https://duckduckgo.com/?q=regular%20search');

            parseSearchQuerySpy.mockRestore();
        });
    });
});

describe('parseReminderTiming', () => {
    it('should schedule weekly reminders for Saturday', () => {
        const timing = searchUtils.parseReminderTiming('weekly', '09:00', 'America/Chicago');

        expect(timing.isValid).toBe(true);
        expect(timing.type).toBe('recurring');
        expect(timing.frequency).toBe('weekly');

        // The reminder should be scheduled for Saturday
        const dueDate = dayjs(timing.nextDue);
        expect(dueDate.day()).toBe(6); // 6 = Saturday
    });

    it('should schedule monthly reminders for the 1st', () => {
        const timing = searchUtils.parseReminderTiming('monthly', '09:00', 'America/Chicago');

        expect(timing.isValid).toBe(true);
        expect(timing.type).toBe('recurring');
        expect(timing.frequency).toBe('monthly');

        // The reminder should be scheduled for the 1st of the month
        const dueDate = dayjs(timing.nextDue);
        expect(dueDate.date()).toBe(1); // 1st of the month
    });

    it('should schedule daily reminders for tomorrow', () => {
        const timing = searchUtils.parseReminderTiming('daily', '09:00', 'America/Chicago');

        expect(timing.isValid).toBe(true);
        expect(timing.type).toBe('recurring');
        expect(timing.frequency).toBe('daily');

        // The reminder should be scheduled for tomorrow at 9 AM
        const nowChicago = dayjs.tz(undefined, 'America/Chicago');
        const dueDate = dayjs(timing.nextDue);

        // Check that it's scheduled for 9 AM in Chicago time (not UTC)
        const dueDateChicago = dueDate.tz('America/Chicago');
        expect(dueDateChicago.hour()).toBe(9);
        expect(dueDateChicago.minute()).toBe(0);

        // Should be in the future
        expect(dueDate.isAfter(nowChicago)).toBe(true);

        // Should be within the next 32 hours (for tomorrow, accounting for timezone differences)
        const diff = dueDate.diff(nowChicago, 'hours');
        expect(diff).toBeGreaterThan(0);
        expect(diff).toBeLessThanOrEqual(32);
    });
});

describe('Trigger Caching', () => {
    let testUser: User;

    beforeEach(async () => {
        const [user] = await db('users')
            .insert({
                username: `cachetest_${Date.now()}`,
                email: `cachetest_${Date.now()}@example.com`,
                is_admin: false,
                api_key: `test_api_key_cache_${Date.now()}`,
            })
            .returning('*');
        testUser = user;
    });

    afterEach(async () => {
        if (testUser?.id) {
            await db('bangs').where({ user_id: testUser.id }).delete();
            await db('tabs').where({ user_id: testUser.id }).delete();
            await db('users').where({ id: testUser.id }).delete();
        }
    });

    describe('loadCachedTriggers', () => {
        it('should load triggers from database and cache in session', async () => {
            await db('bangs').insert([
                {
                    user_id: testUser.id,
                    trigger: '!test1',
                    name: 'Test 1',
                    url: 'https://test1.com',
                    action_type: 'redirect',
                },
                {
                    user_id: testUser.id,
                    trigger: '!test2',
                    name: 'Test 2',
                    url: 'https://test2.com',
                    action_type: 'redirect',
                },
            ]);
            await db('tabs').insert([{ user_id: testUser.id, trigger: '!tab1', title: 'Tab 1' }]);

            const req = { logger: mockLogger(), session: {} } as unknown as Request;

            const result = await searchUtils.loadCachedTriggers(req, testUser.id);

            expect(typeof result.bangTriggers).toBe('object');
            expect(typeof result.tabTriggers).toBe('object');
            expect(result.bangTriggers['!test1']).toBe(true);
            expect(result.bangTriggers['!test2']).toBe(true);
            expect(result.tabTriggers['!tab1']).toBe(true);

            expect(req.session.bangTriggersMap?.['!test1']).toBe(true);
            expect(req.session.bangTriggersMap?.['!test2']).toBe(true);
            expect(req.session.tabTriggersMap?.['!tab1']).toBe(true);
            expect(req.session.triggersCachedAt).toBeDefined();
            expect(req.session.triggersCachedAt).toBeGreaterThan(0);
        });

        it('should return cached triggers without hitting database', async () => {
            const cachedTime = Date.now();
            const req = {
                logger: mockLogger(),
                session: {
                    bangTriggersMap: { '!cached1': true, '!cached2': true },
                    tabTriggersMap: { '!cachedtab': true },
                    triggersCachedAt: cachedTime,
                },
            } as unknown as Request;

            const result = await searchUtils.loadCachedTriggers(req, testUser.id);

            expect(result.bangTriggers['!cached1']).toBe(true);
            expect(result.bangTriggers['!cached2']).toBe(true);
            expect(result.tabTriggers['!cachedtab']).toBe(true);

            expect(req.session.triggersCachedAt).toBe(cachedTime);
        });

        it('should refresh cache when expired', async () => {
            await db('bangs').insert({
                user_id: testUser.id,
                trigger: '!fresh',
                name: 'Fresh',
                url: 'https://fresh.com',
                action_type: 'redirect',
            });

            const expiredTime = Date.now() - 61 * 60 * 1000; // 61 minutes ago (cache TTL is 60 min)
            const req = {
                logger: mockLogger(),
                session: {
                    bangTriggersMap: { '!stale': true },
                    tabTriggersMap: {},
                    triggersCachedAt: expiredTime,
                },
            } as unknown as Request;

            const result = await searchUtils.loadCachedTriggers(req, testUser.id);

            expect(result.bangTriggers['!fresh']).toBe(true);
            expect(result.bangTriggers['!stale']).toBeUndefined();

            expect(req.session.triggersCachedAt).toBeGreaterThan(expiredTime);
        });

        it('should return empty objects for user with no bangs or tabs', async () => {
            const req = { logger: mockLogger(), session: {} } as unknown as Request;

            const result = await searchUtils.loadCachedTriggers(req, testUser.id);

            expect(Object.keys(result.bangTriggers).length).toBe(0);
            expect(Object.keys(result.tabTriggers).length).toBe(0);
            expect(req.session.bangTriggersMap).toEqual({});
            expect(req.session.tabTriggersMap).toEqual({});
        });
    });

    describe('invalidateTriggerCache', () => {
        it('should clear all trigger cache data from session', () => {
            const req = {
                logger: mockLogger(),
                session: {
                    bangTriggersMap: { '!test1': true, '!test2': true },
                    tabTriggersMap: { '!tab1': true },
                    triggersCachedAt: Date.now(),
                    user: { id: 1 },
                },
            } as unknown as Request;

            searchUtils.invalidateTriggerCache(req);

            expect(req.session.bangTriggersMap).toBeUndefined();
            expect(req.session.tabTriggersMap).toBeUndefined();
            expect(req.session.triggersCachedAt).toBeUndefined();
            expect(req.session.user).toBeDefined();
        });

        it('should handle session without cache data', () => {
            const req = {
                logger: mockLogger(),
                session: {
                    user: { id: 1 },
                },
            } as unknown as Request;

            expect(() => searchUtils.invalidateTriggerCache(req)).not.toThrow();
        });

        it('should handle missing session', () => {
            const req = {} as unknown as Request;

            expect(() => searchUtils.invalidateTriggerCache(req)).not.toThrow();
        });
    });
});

describe('Bang Search Optimization', () => {
    let testUser: User;

    beforeEach(async () => {
        const [user] = await db('users')
            .insert({
                username: `bangopt_${Date.now()}`,
                email: `bangopt_${Date.now()}@example.com`,
                is_admin: false,
                api_key: `test_api_key_bangopt_${Date.now()}`,
                column_preferences: JSON.stringify({}),
            })
            .returning('*');
        testUser = {
            ...user,
            column_preferences: {},
        };
    });

    afterEach(async () => {
        if (testUser?.id) {
            await db('bangs').where({ user_id: testUser.id }).delete();
            await db('tabs').where({ user_id: testUser.id }).delete();
            await db('users').where({ id: testUser.id }).delete();
        }
    });

    it('should skip DB query for system bang when user has no custom override', async () => {
        const req = {
            logger: mockLogger(),
            session: {
                bangTriggers: [],
                tabTriggers: [],
                triggersCachedAt: Date.now(),
            },
        } as unknown as Request;

        const res = {
            redirect: vi.fn(),
            set: vi.fn().mockReturnThis(),
        } as unknown as Response;

        await searchUtils.search({
            req,
            res,
            user: testUser,
            query: '!g python',
        });

        expect(res.redirect).toHaveBeenCalledWith('https://www.google.com/search?q=python');
    });

    it('should query DB for custom bang when trigger exists in cache', async () => {
        await db('bangs').insert({
            user_id: testUser.id,
            trigger: '!g',
            name: 'My Google',
            url: 'https://my-google.com/search?q={{{s}}}',
            action_type: 'search',
        });

        const req = {
            logger: mockLogger(),
            session: {
                bangTriggers: ['!g'],
                tabTriggers: [],
                triggersCachedAt: Date.now(),
            },
        } as unknown as Request;

        const res = {
            redirect: vi.fn(),
            set: vi.fn().mockReturnThis(),
        } as unknown as Response;

        await searchUtils.search({
            req,
            res,
            user: testUser,
            query: '!g python',
        });

        expect(res.redirect).toHaveBeenCalledWith('https://my-google.com/search?q=python');
    });

    it('should query DB for tab when trigger exists in cache', async () => {
        const [tab] = await db('tabs')
            .insert({
                user_id: testUser.id,
                trigger: '!mytabs',
                title: 'My Tab Group',
            })
            .returning('*');

        const req = {
            logger: mockLogger(),
            session: {
                bangTriggers: [],
                tabTriggers: ['!mytabs'],
                triggersCachedAt: Date.now(),
            },
        } as unknown as Request;

        const res = {
            redirect: vi.fn(),
            set: vi.fn().mockReturnThis(),
        } as unknown as Response;

        await searchUtils.search({
            req,
            res,
            user: testUser,
            query: '!mytabs',
        });

        expect(res.redirect).toHaveBeenCalledWith(`/tabs/${tab.id}/launch`);
    });

    it('should cache triggers on first search and use cache on subsequent searches', async () => {
        await db('bangs').insert({
            user_id: testUser.id,
            trigger: '!custom',
            name: 'Custom',
            url: 'https://custom.com',
            action_type: 'redirect',
        });

        const req = { logger: mockLogger(), session: {} } as unknown as Request;

        const res = {
            redirect: vi.fn(),
            set: vi.fn().mockReturnThis(),
        } as unknown as Response;

        await searchUtils.search({
            req,
            res,
            user: testUser,
            query: '!g python',
        });

        expect(req.session.bangTriggersMap?.['!custom']).toBe(true);
        expect(req.session.triggersCachedAt).toBeDefined();

        const cachedTime = req.session.triggersCachedAt;
        vi.mocked(res.redirect).mockClear();

        await searchUtils.search({
            req,
            res,
            user: testUser,
            query: '!custom',
        });

        expect(res.redirect).toHaveBeenCalledWith('https://custom.com');
        expect(req.session.triggersCachedAt).toBe(cachedTime);
    });

    it('should use system bang when custom bang not in cache', async () => {
        const req = {
            logger: mockLogger(),
            session: {
                bangTriggersMap: {},
                tabTriggersMap: {},
                triggersCachedAt: Date.now(),
            },
        } as unknown as Request;

        const res = {
            redirect: vi.fn(),
            set: vi.fn().mockReturnThis(),
        } as unknown as Response;

        await searchUtils.search({
            req,
            res,
            user: testUser,
            query: '!yt video',
        });

        expect(res.redirect).toHaveBeenCalledWith(
            'https://www.youtube.com/results?search_query=video',
        );
    });

    it('should fall back to default search for unknown bang not in cache', async () => {
        const req = {
            logger: mockLogger(),
            session: {
                bangTriggers: [],
                tabTriggers: [],
                triggersCachedAt: Date.now(),
            },
        } as unknown as Request;

        const res = {
            redirect: vi.fn(),
            set: vi.fn().mockReturnThis(),
        } as unknown as Response;

        await searchUtils.search({
            req,
            res,
            user: { ...testUser, default_search_provider: 'duckduckgo' },
            query: '!unknownbang',
        });

        expect(res.redirect).toHaveBeenCalledWith('https://duckduckgo.com/?q=unknownbang');
    });
});

describe('Bang Search Performance', () => {
    let testUser: User;

    beforeEach(async () => {
        const [user] = await db('users')
            .insert({
                username: `perftest_${Date.now()}`,
                email: `perftest_${Date.now()}@example.com`,
                is_admin: false,
                api_key: `test_api_key_perf_${Date.now()}`,
                column_preferences: JSON.stringify({}),
            })
            .returning('*');
        testUser = { ...user, column_preferences: {} };

        await db('bangs').insert([
            {
                user_id: testUser.id,
                trigger: '!custom1',
                name: 'Custom 1',
                url: 'https://custom1.com',
                action_type: 'redirect',
            },
            {
                user_id: testUser.id,
                trigger: '!custom2',
                name: 'Custom 2',
                url: 'https://custom2.com/q={{{s}}}',
                action_type: 'search',
            },
        ]);
        await db('tabs').insert([{ user_id: testUser.id, trigger: '!mytab', title: 'My Tab' }]);
    });

    afterEach(async () => {
        if (testUser?.id) {
            await db('bangs').where({ user_id: testUser.id }).delete();
            await db('tabs').where({ user_id: testUser.id }).delete();
            await db('users').where({ id: testUser.id }).delete();
        }
    });

    it('should be faster with cache hit vs cache miss', async () => {
        const res = {
            redirect: vi.fn(),
            set: vi.fn().mockReturnThis(),
        } as unknown as Response;

        const reqCold = { logger: mockLogger(), session: {} } as unknown as Request;
        const startCold = performance.now();
        await searchUtils.search({ req: reqCold, res, user: testUser, query: '!g test' });
        const coldTime = performance.now() - startCold;

        vi.mocked(res.redirect).mockClear();
        const startWarm = performance.now();
        await searchUtils.search({ req: reqCold, res, user: testUser, query: '!yt video' });
        const warmTime = performance.now() - startWarm;

        expect(reqCold.session.triggersCachedAt).toBeDefined();
        expect(warmTime).toBeLessThan(coldTime * 2); // Allow some variance
    });

    it('should skip DB query when using system bang with empty custom triggers', async () => {
        const res = {
            redirect: vi.fn(),
            set: vi.fn().mockReturnThis(),
        } as unknown as Response;

        const req = {
            logger: mockLogger(),
            session: {
                bangTriggers: [],
                tabTriggers: [],
                triggersCachedAt: Date.now(),
            },
        } as unknown as Request;

        const iterations = 10;
        const times: number[] = [];

        for (let i = 0; i < iterations; i++) {
            vi.mocked(res.redirect).mockClear();
            const start = performance.now();
            await searchUtils.search({ req, res, user: testUser, query: `!g query${i}` });
            times.push(performance.now() - start);
        }

        const avgTime = times.reduce((a, b) => a + b, 0) / times.length;

        expect(req.session.triggersCachedAt).toBeDefined();

        expect(res.redirect).toHaveBeenLastCalledWith(expect.stringContaining('google.com'));

        expect(avgTime).toBeLessThan(50);
    });

    it('should use custom bang when in cache', async () => {
        const res = {
            redirect: vi.fn(),
            set: vi.fn().mockReturnThis(),
        } as unknown as Response;

        const req = {
            logger: mockLogger(),
            session: {
                bangTriggers: ['!custom1', '!custom2'],
                tabTriggers: ['!mytab'],
                triggersCachedAt: Date.now(),
            },
        } as unknown as Request;

        await searchUtils.search({ req, res, user: testUser, query: '!custom1' });

        expect(res.redirect).toHaveBeenCalledWith('https://custom1.com');
    });
});
