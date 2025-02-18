import { Request, Response } from 'express';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { search } from './search';

describe('search', () => {
	describe('unauthenticated user flow', () => {
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
	});
});
