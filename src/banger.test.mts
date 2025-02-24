import fs from 'node:fs';
import type { Bang } from './type.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchBangs, createHashMap, writeHashMapToFile, generateBangsHashMap } from './banger.mjs';

vi.mock('node:fs', () => ({
	default: {
		promises: {
			readFile: vi.fn(),
		},
		writeFileSync: vi.fn(),
	},
}));

const fetchMock = vi.fn();
global.fetch = fetchMock;

describe('banger', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('fetchBangs', () => {
		it('should fetch bangs from URL', async () => {
			const mockBangs: Bang[] = [
				{
					c: 'Multimedia',
					d: 'www.example.com',
					r: 70,
					s: 'Example',
					sc: 'Video',
					t: '4',
					u: 'https://www.example.com/workout-videos/?frm_search={{{s}}}',
				},
			];
			fetchMock.mockResolvedValueOnce({
				json: () => Promise.resolve(mockBangs),
			});

			const result = await fetchBangs('https://example.com/bangs');
			expect(result).toEqual(mockBangs);
			expect(fetchMock).toHaveBeenCalledWith('https://example.com/bangs');
		});

		it('should read bangs from local file', async () => {
			const mockBangs = { bangs: [{ t: 'test', u: 'https://test.com' }] };
			vi.mocked(fs.promises.readFile).mockResolvedValueOnce(JSON.stringify(mockBangs));

			const result = await fetchBangs('./local/file.json');
			expect(result).toEqual(mockBangs.bangs);
			expect(fs.promises.readFile).toHaveBeenCalledWith('./local/file.json', 'utf8');
		});
	});

	describe('createHashMap', () => {
		it('should create hash map from bangs array', () => {
			const bangs: Bang[] = [
				{
					c: 'Multimedia',
					d: 'www.example.com',
					r: 70,
					s: 'Example',
					sc: 'Video',
					t: 'test1',
					u: 'https://www.example.com/workout-videos/?frm_search={{{s}}}',
				},
				{
					c: 'some category',
					d: 'www.example.com',
					r: 70,
					s: 'Example',
					sc: 'Video',
					t: 'test2',
					u: 'https://www.example.com/workout-videos/?frm_search={{{s}}}',
				},
			];

			const result = createHashMap(bangs);
			expect(result.size).toBe(2);
			expect(result.get('test1')).toEqual(bangs[0]);
			expect(result.get('test2')).toEqual(bangs[1]);
		});
	});

	describe('writeHashMapToFile', () => {
		it('should write hash map to file', () => {
			const hashMap = new Map<string, Bang>([
				[
					'test1',
					{
						t: 'test1',
						u: 'https://test1.com',
						c: 'Category',
						d: 'test.com',
						r: 1,
						s: 'Test',
						sc: 'Testing',
					},
				],
			]);

			writeHashMapToFile(hashMap, 'output.ts');

			expect(fs.writeFileSync).toHaveBeenCalledWith(
				'output.ts',
				expect.stringContaining('export const bangs'),
			);
			expect(fs.writeFileSync).toHaveBeenCalledWith(
				'output.ts',
				expect.stringContaining('"test1"'),
			);
		});
	});

	describe('generateBangsHashMap', () => {
		it('should generate bangs hash map from URL', async () => {
			const mockBangs: Bang[] = [
				{
					c: 'Multimedia',
					d: 'www.example.com',
					r: 70,
					s: 'Example',
					sc: 'Video',
					t: '4',
					u: 'https://www.example.com/workout-videos/?frm_search={{{s}}}',
				},
			];
			fetchMock.mockResolvedValueOnce({
				json: () => Promise.resolve(mockBangs),
			});

			await generateBangsHashMap('https://example.com/bangs', 'output.ts');

			expect(fetchMock).toHaveBeenCalledWith('https://example.com/bangs');
			expect(fs.writeFileSync).toHaveBeenCalled();
		});

		it('should handle missing arguments', async () => {
			const exitSpy = vi.spyOn(process, 'exit').mockImplementation(() => {
				return undefined as never;
			});
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());

			await generateBangsHashMap();

			expect(exitSpy).toHaveBeenCalledWith(1);
			expect(consoleSpy).toHaveBeenCalled();

			exitSpy.mockRestore();
			consoleSpy.mockRestore();
		});

		it('should handle errors', async () => {
			const consoleSpy = vi.spyOn(console, 'error').mockImplementation(vi.fn());
			fetchMock.mockRejectedValueOnce(new Error('Network error'));

			await generateBangsHashMap('https://example.com/bangs', 'output.ts');

			expect(consoleSpy).toHaveBeenCalledWith('Error:', 'Network error');
			consoleSpy.mockRestore();
		});
	});
});
