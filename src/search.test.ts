import { db } from './db/db';
import { User } from './types';
import { search } from './search';
import { appConfig } from './configs';
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
			expect(res.redirect).toHaveBeenCalledWith('https://duckduckgo.com/?q=!doesnotexistanywhere');
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
				expect.stringContaining('window.location.href = "https://duckduckgo.com/?q=python"'),
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
				expect.stringContaining('window.location.href = "https://duckduckgo.com/?q=python"'),
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

				await search({ req, res, user: undefined, query: '!g python' });

				expect(res.status).toHaveBeenCalledWith(200);
				expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/html');
				expect(res.send).toHaveBeenCalledWith(
					expect.stringContaining('Your next search will be slowed down for 10 seconds.'),
				);
				expect(res.send).toHaveBeenCalledWith(
					expect.stringContaining(
						'window.location.href = "https://www.google.com/search?q=python"',
					),
				);
				expect(req.session.searchCount).toBe(62);
				expect(req.session.cumulativeDelay).toBe(10000);
				expect(req.session.user).toBeUndefined();
			},
		);
	});

	describe('authenticated', () => {
		beforeAll(async () => {
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
				default_per_page: 10,
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
			default_per_page: 10,
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

		it.skip('should handle bookmark creation with title', async () => {
			const req = {} as Request;
			const res = {
				redirect: vi.fn(),
				setHeader: vi.fn().mockReturnThis(),
				status: vi.fn().mockReturnThis(),
				send: vi.fn(),
			} as unknown as Response;

			// Mock utils
			vi.mock('./utils', async () => {
				const actual = await vi.importActual('./utils');
				return {
					...(actual as object),
					insertBookmarkQueue: {
						push: vi.fn().mockResolvedValue(undefined),
					},
					isValidUrl: () => true,
					parseSearchQuery: () => ({
						trigger: '!bm',
						url: 'https://example.com',
						searchTerm: '',
						triggerWithoutBang: 'bm',
					}),
				};
			});

			await search({
				req,
				res,
				user: testUser,
				query: '!bm My Bookmark https://example.com',
			});

			expect(res.redirect).toHaveBeenCalledWith('https://example.com');
			vi.resetModules();
		});

		it.skip('should handle bookmark creation without title', async () => {
			const req = {} as Request;
			const res = {
				redirect: vi.fn(),
				setHeader: vi.fn().mockReturnThis(),
				status: vi.fn().mockReturnThis(),
				send: vi.fn(),
			} as unknown as Response;

			// Mock utils
			vi.mock('./utils', async () => {
				const actual = await vi.importActual('./utils');
				return {
					...(actual as object),
					insertBookmarkQueue: {
						push: vi.fn().mockResolvedValue(undefined),
					},
					isValidUrl: () => true,
					parseSearchQuery: () => ({
						trigger: '!bm',
						url: 'https://example.com',
						searchTerm: '',
						triggerWithoutBang: 'bm',
					}),
				};
			});

			await search({
				req,
				res,
				user: testUser,
				query: '!bm https://example.com',
			});

			expect(res.redirect).toHaveBeenCalledWith('https://example.com');
			vi.resetModules();
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
			expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Invalid or missing URL'));
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
			expect(res.send).toHaveBeenCalledWith(expect.stringContaining('${trigger} already exists'));
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

		it.skip('should handle !bm with multi-word title', async () => {
			const req = {} as Request;
			const res = {
				redirect: vi.fn(),
				setHeader: vi.fn().mockReturnThis(),
				status: vi.fn().mockReturnThis(),
				send: vi.fn(),
			} as unknown as Response;

			// Mock utils
			// vi.mock('./utils', async () => {
			// 	const actual = await vi.importActual('./utils');
			// 	return {
			// 		...actual as object,
			// 		insertBookmarkQueue: {
			// 			push: vi.fn().mockResolvedValue(undefined)
			// 		},
			// 		isValidUrl: () => true,
			// 		parseSearchQuery: () => ({
			// 			trigger: '!bm',
			// 			url: 'https://example.com',
			// 			searchTerm: '',
			// 			triggerWithoutBang: 'bm'
			// 		})
			// 	};
			// });

			await search({
				req,
				res,
				user: testUser,
				query: '!bm This is a very long title https://example.com',
			});

			expect(res.redirect).toHaveBeenCalledWith('https://example.com');
			vi.resetModules();
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

			expect(res.redirect).toHaveBeenCalledWith('https://www.google.com/search?q=test%20search');
		});

		it.skip('should handle bookmark creation errors', async () => {
			const req = {} as Request;
			const res = {
				setHeader: vi.fn().mockReturnThis(),
				status: vi.fn().mockReturnThis(),
				send: vi.fn(),
			} as unknown as Response;

			// Mock insertBookmarkQueue to throw an error
			vi.mock('./utils', async () => {
				const actual = await vi.importActual('./utils');
				return {
					...(actual as object),
					insertBookmarkQueue: {
						push: () => {
							throw new Error('Database error');
						},
					},
				};
			});

			await search({
				req,
				res,
				user: testUser,
				query: '!bm title https://example.com',
			});

			expect(res.status).toHaveBeenCalledWith(422);
			expect(res.send).toHaveBeenCalledWith(expect.stringContaining('Error adding bookmark'));

			// Clean up mock
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
