import fs from 'node:fs';
import type { Bang } from './type.js';

interface BangSource {
    name: string;
    url: string;
    priority: number;
}

interface Dependencies {
    fetch: typeof fetch;
    fs: typeof fs;
    console: typeof console;
    process: typeof process;
}

export function mergeBangSources(
    sources: { bangs: Bang[]; priority: number }[],
): Map<string, Bang> {
    const result = new Map<string, Bang>();

    // Sort by priority (lowest first, so higher priority overwrites)
    const sortedSources = sources.sort((a, b) => a.priority - b.priority);

    for (const source of sortedSources) {
        for (const bang of source.bangs) {
            if (bang.t && bang.t.trim()) {
                result.set(bang.t.trim(), bang);
            }
        }
    }

    return result;
}

export async function fetchBangsFromSource(url: string, fetcher = fetch): Promise<Bang[]> {
    if (url.startsWith('http')) {
        const response = await fetcher(url);
        const data = (await response.json()) as any;
        return Array.isArray(data) ? data : data.bangs || [];
    } else {
        const fileContent = await fs.promises.readFile(url, 'utf8');
        const module = JSON.parse(fileContent) as any;
        return Array.isArray(module) ? module : module.bangs || [];
    }
}

export function generateBangFile(bangs: Map<string, Bang>): string {
    const plainObject = Object.fromEntries(bangs);
    return `export const bangs: Record<string, Record<string, string|number>> = ${JSON.stringify(
        plainObject,
        null,
        2,
    )};`;
}

export function getDefaultSources(): BangSource[] {
    return [
        {
            name: 'Kagi',
            url: 'https://raw.githubusercontent.com/kagisearch/bangs/refs/heads/main/data/bangs.json',
            priority: 2,
        },
        {
            name: 'DuckDuckGo',
            url: 'https://duckduckgo.com/bang.js',
            priority: 1,
        },
    ];
}

export function parseCliArgs(args: string[]): { sources?: BangSource[]; outputPath?: string } {
    if (args.length === 0) {
        return {
            sources: getDefaultSources(),
            outputPath: './src/db/bang.ts',
        };
    }

    if (args.length === 1) {
        return {
            sources: getDefaultSources(),
            outputPath: args[0],
        };
    }

    // Multiple args: last is output, rest are sources
    const outputPath = args[args.length - 1];
    const sourceUrls = args.slice(0, -1);
    const sources = sourceUrls.map((url, index) => ({
        name: `Source ${index + 1}`,
        url,
        priority: index + 1,
    }));

    return { sources, outputPath };
}

export async function buildBangs(
    sources: BangSource[],
    outputPath: string,
    deps: Dependencies = {
        fetch,
        fs,
        console,
        process,
    },
): Promise<{ totalBangs: number; duplicates: number }> {
    const fetchedSources: { bangs: Bang[]; priority: number }[] = [];

    for (const source of sources) {
        try {
            const bangs = await fetchBangsFromSource(source.url, deps.fetch);
            fetchedSources.push({ bangs, priority: source.priority });
            deps.console.log(`✓ Fetched ${bangs.length} bangs from ${source.name}`);
        } catch (error) {
            deps.console.error(
                `✗ Failed to fetch from ${source.name}:`,
                error instanceof Error ? error.message : 'Unknown error',
            );
            fetchedSources.push({ bangs: [], priority: source.priority });
        }
    }

    const mergedBangs = mergeBangSources(fetchedSources);
    const content = generateBangFile(mergedBangs);

    await deps.fs.promises.writeFile(outputPath, content);

    const totalFetched = fetchedSources.reduce((sum, s) => sum + s.bangs.length, 0);

    return {
        totalBangs: mergedBangs.size,
        duplicates: totalFetched - mergedBangs.size,
    };
}

export async function main(args: string[] = process.argv.slice(2)): Promise<void> {
    try {
        const { sources, outputPath } = parseCliArgs(args);

        if (!sources || !outputPath) {
            console.error('Please provide source URLs/files and an output file path.');
            console.error('Usage: tsx banger.mts [source1] [source2] ... <outputFile>');
            console.error(
                'Or use default sources by just providing output file: tsx banger.mts <outputFile>',
            );
            process.exit(1);
        }

        console.log(`Building bangs from ${sources.length} sources...`);
        sources.forEach((source, index) => {
            console.log(`  ${index + 1}. ${source.name} (priority: ${source.priority})`);
        });

        const result = await buildBangs(sources, outputPath);

        console.log(
            `\n✓ Generated ${result.totalBangs} unique bangs (${result.duplicates} duplicates resolved)`,
        );
        console.log(`✓ Written to ${outputPath}`);
    } catch (error) {
        console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
        process.exit(1);
    }
}

// tsx ./src/banger.mts ./src/db/bang.ts
// tsx ./src/banger.mts https://duckduckgo.com/bang.js ./src/db/bang.ts
// tsx ./src/banger.mts https://raw.githubusercontent.com/kagisearch/bangs/refs/heads/main/data/bangs.json ./src/db/bang.ts
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}
