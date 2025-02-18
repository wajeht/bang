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
		});
	});
});
