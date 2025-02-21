import fs from 'node:fs';
import type { Bang } from './types';

export async function fetchBangs(source: string): Promise<Bang[]> {
	if (source.startsWith('http')) {
		const response = await fetch(source);
		const data = await response.json();
		return data as Bang[];
	} else {
		const fileContent = await fs.promises.readFile(source, 'utf8');
		const module = JSON.parse(fileContent);
		return module.bangs;
	}
}

export function createHashMap(bangs: Bang[]): Map<string, Bang> {
	const hashMap = new Map<string, Bang>();
	for (const bang of bangs) {
		if (bang.t) {
			hashMap.set(bang.t, bang);
		}
	}
	return hashMap;
}

export function writeHashMapToFile(hashMap: Map<string, Bang>, outputFile: string): void {
	const plainObject = Object.fromEntries(hashMap);
	const jsContent = `export const bangs: Record<string, Record<string, string|number>> = ${JSON.stringify(plainObject, null, 2)};`;
	fs.writeFileSync(outputFile, jsContent);
	console.log(`Hash map written to ${outputFile}`);
}

export async function generateBangsHashMap(source?: string, outputFile?: string): Promise<void> {
	try {
		source = source || process.argv[2];
		outputFile = outputFile || process.argv[3];

		if (!source || !outputFile) {
			console.error(
				'Please provide a URL or local file path as the first argument and the output file path as the second argument.',
			);
			process.exit(1);
		}

		const bangs = await fetchBangs(source);
		const hashMap = createHashMap(bangs);
		writeHashMapToFile(hashMap, outputFile);
	} catch (error) {
		console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
	}
}

// tsx ./src/banger.mts https://duckduckgo.com/bang.js ./src/db/bangs.ts
if (import.meta.url === `file://${process.argv[1]}`) {
	generateBangsHashMap().catch(console.error);
}
