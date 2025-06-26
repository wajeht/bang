import {
    buildBangs,
    parseCliArgs,
    generateBangFile,
    mergeBangSources,
    getDefaultSources,
    fetchBangsFromSource,
} from './banger.mjs';
import fs from 'node:fs';
import type { Bang } from '../type.js';
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('node:fs', () => ({
    default: {
        promises: {
            readFile: vi.fn(),
            writeFile: vi.fn(),
        },
        writeFileSync: vi.fn(),
    },
}));

const fetchMock = vi.fn();

describe('banger', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.spyOn(console, 'log').mockImplementation(vi.fn());
        vi.spyOn(console, 'error').mockImplementation(vi.fn());
    });

    describe('fetchBangsFromSource', () => {
        it('should fetch bangs from URL when response is array', async () => {
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

            const result = await fetchBangsFromSource('https://example.com/bangs', fetchMock);
            expect(result).toEqual(mockBangs);
            expect(fetchMock).toHaveBeenCalledWith('https://example.com/bangs');
        });

        it('should fetch bangs from URL when response has bangs property', async () => {
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
                json: () => Promise.resolve({ bangs: mockBangs }),
            });

            const result = await fetchBangsFromSource('https://example.com/bangs', fetchMock);
            expect(result).toEqual(mockBangs);
        });

        it('should return empty array when response has no bangs', async () => {
            fetchMock.mockResolvedValueOnce({
                json: () => Promise.resolve({ other: 'data' }),
            });

            const result = await fetchBangsFromSource('https://example.com/bangs', fetchMock);
            expect(result).toEqual([]);
        });

        it('should read bangs from local file', async () => {
            const mockBangs = { bangs: [{ t: 'test', u: 'https://test.com' }] };
            vi.mocked(fs.promises.readFile).mockResolvedValueOnce(JSON.stringify(mockBangs));

            const result = await fetchBangsFromSource('./local/file.json');
            expect(result).toEqual(mockBangs.bangs);
            expect(fs.promises.readFile).toHaveBeenCalledWith('./local/file.json', 'utf8');
        });
    });

    describe('mergeBangSources', () => {
        it('should prioritize higher priority sources', () => {
            const sources = [
                {
                    bangs: [
                        {
                            c: 'Search',
                            d: 'ddg.com',
                            r: 1,
                            s: 'DDG',
                            sc: 'Search',
                            t: 'test',
                            u: 'https://ddg.com',
                        },
                    ],
                    priority: 1,
                },
                {
                    bangs: [
                        {
                            c: 'Search',
                            d: 'kagi.com',
                            r: 2,
                            s: 'Kagi',
                            sc: 'Search',
                            t: 'test',
                            u: 'https://kagi.com',
                        },
                    ],
                    priority: 2,
                },
            ];

            const result = mergeBangSources(sources);

            expect(result.size).toBe(1);
            expect(result.get('test')?.s).toBe('Kagi'); // Higher priority wins
        });

        it('should handle empty bang arrays', () => {
            const sources = [
                { bangs: [], priority: 1 },
                { bangs: [], priority: 2 },
            ];

            const result = mergeBangSources(sources);
            expect(result.size).toBe(0);
        });

        it('should filter out bangs with empty triggers', () => {
            const sources = [
                {
                    bangs: [
                        {
                            c: 'Test',
                            d: 'example.com',
                            r: 1,
                            s: 'Test',
                            sc: 'Test',
                            t: '',
                            u: 'https://example.com',
                        },
                        {
                            c: 'Test',
                            d: 'example.com',
                            r: 1,
                            s: 'Test',
                            sc: 'Test',
                            t: 'valid',
                            u: 'https://example.com',
                        },
                    ],
                    priority: 1,
                },
            ];

            const result = mergeBangSources(sources);
            expect(result.size).toBe(1);
            expect(result.get('valid')).toBeDefined();
        });
    });

    describe('generateBangFile', () => {
        it('should generate correct file content', () => {
            const bangs = new Map([
                [
                    'test',
                    {
                        c: 'Test',
                        d: 'example.com',
                        r: 1,
                        s: 'Test',
                        sc: 'Test',
                        t: 'test',
                        u: 'https://example.com',
                    },
                ],
            ]);

            const result = generateBangFile(bangs);

            expect(result).toContain('export const bangs');
            expect(result).toContain('"test"');
        });
    });

    describe('parseCliArgs', () => {
        it('should return defaults for no arguments', () => {
            const result = parseCliArgs([]);

            expect(result.sources).toHaveLength(2);
            expect(result.outputPath).toBe('./src/db/bang.ts');
        });

        it('should use defaults sources with custom output path', () => {
            const result = parseCliArgs(['output.ts']);

            expect(result.sources).toHaveLength(2);
            expect(result.outputPath).toBe('output.ts');
        });

        it('should parse custom sources and output', () => {
            const result = parseCliArgs([
                'https://source1.com',
                'https://source2.com',
                'output.ts',
            ]);

            expect(result.sources).toHaveLength(2);
            expect(result.sources?.[0]?.url).toBe('https://source1.com');
            expect(result.sources?.[1]?.url).toBe('https://source2.com');
            expect(result.outputPath).toBe('output.ts');
        });
    });

    describe('getDefaultSources', () => {
        it('should return Kagi and DuckDuckGo with correct priorities', () => {
            const sources = getDefaultSources();

            expect(sources).toHaveLength(2);
            expect(sources.find((s) => s.name === 'Kagi')?.priority).toBe(2);
            expect(sources.find((s) => s.name === 'DuckDuckGo')?.priority).toBe(1);
        });
    });

    describe('buildBangs', () => {
        it('should build bangs from multiple sources', async () => {
            const mockDeps = {
                fetch: fetchMock,
                fs: {
                    promises: {
                        writeFile: vi.fn(),
                    },
                } as any,
                console: {
                    log: vi.fn(),
                    error: vi.fn(),
                } as any,
                process: {} as any,
            };

            fetchMock
                .mockResolvedValueOnce({
                    json: () => Promise.resolve([{ t: 'kagi', s: 'Kagi' }]),
                })
                .mockResolvedValueOnce({
                    json: () => Promise.resolve([{ t: 'ddg', s: 'DDG' }]),
                });

            const sources = [
                { name: 'Kagi', url: 'https://kagi.com', priority: 2 },
                { name: 'DDG', url: 'https://ddg.com', priority: 1 },
            ];

            const result = await buildBangs(sources, 'output.ts', mockDeps);

            expect(result.totalBangs).toBe(2);
            expect(result.duplicates).toBe(0);
            expect(mockDeps.fs.promises.writeFile).toHaveBeenCalledWith(
                'output.ts',
                expect.any(String),
            );
        });

        it('should handle failed sources gracefully', async () => {
            const mockDeps = {
                fetch: fetchMock,
                fs: {
                    promises: {
                        writeFile: vi.fn(),
                    },
                } as any,
                console: {
                    log: vi.fn(),
                    error: vi.fn(),
                } as any,
                process: {} as any,
            };

            fetchMock
                .mockResolvedValueOnce({
                    json: () => Promise.resolve([{ t: 'test', s: 'Good' }]),
                })
                .mockRejectedValueOnce(new Error('Network error'));

            const sources = [
                { name: 'Good', url: 'https://good.com', priority: 1 },
                { name: 'Bad', url: 'https://bad.com', priority: 2 },
            ];

            const result = await buildBangs(sources, 'output.ts', mockDeps);

            expect(result.totalBangs).toBe(1);
            expect(mockDeps.console.error).toHaveBeenCalledWith(
                '✗ Failed to fetch from Bad:',
                'Network error',
            );
        });
    });

    // Integration tests for end-to-end functionality
    describe('Integration tests', () => {
        it('should use new API directly with fetchBangsFromSource', async () => {
            fetchMock.mockResolvedValueOnce({
                json: () => Promise.resolve([{ t: 'test' }]),
            });

            const result = await fetchBangsFromSource('https://example.com', fetchMock);
            expect(result).toEqual([{ t: 'test' }]);
        });

        it('should convert old-style bang arrays to new format and merge correctly', () => {
            // Simulate converting old API usage to new API
            const bangsSources = [
                [
                    {
                        c: 'Test',
                        d: 'kagi.com',
                        r: 1,
                        s: 'Kagi',
                        sc: 'Test',
                        t: 'test',
                        u: 'https://kagi.com',
                    },
                ],
                [
                    {
                        c: 'Test',
                        d: 'ddg.com',
                        r: 1,
                        s: 'DDG',
                        sc: 'Test',
                        t: 'test',
                        u: 'https://ddg.com',
                    },
                ],
            ];

            // Convert to new format
            const sources = bangsSources.map((bangs, index) => ({
                bangs,
                priority: index === 0 ? 2 : 1, // Kagi (index 0) gets higher priority
            }));

            const result = mergeBangSources(sources);

            expect(result.size).toBe(1);
            expect(result.get('test')?.s).toBe('Kagi'); // First source (Kagi) should win
        });

        it('should generate and write bang file using new API', () => {
            const hashMap = new Map([
                [
                    'test',
                    {
                        c: 'Test',
                        d: 'example.com',
                        r: 1,
                        s: 'Test',
                        sc: 'Test',
                        t: 'test',
                        u: 'https://example.com',
                    },
                ],
            ]);

            const content = generateBangFile(hashMap);
            fs.writeFileSync('output.ts', content);
            console.log(`Hash map with ${hashMap.size} unique bangs written to output.ts`);

            expect(fs.writeFileSync).toHaveBeenCalledWith(
                'output.ts',
                expect.stringContaining('export const bangs'),
            );
            expect(console.log).toHaveBeenCalledWith(
                'Hash map with 1 unique bangs written to output.ts',
            );
        });
    });
});
