import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { search } from './search';

describe('search', () => {
	it('should work', async () => {
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

		await search({ req, res, user: null, query: '!g python' });

		expect(res.status).toBe(200);
	});
});
