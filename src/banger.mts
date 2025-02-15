import fs from 'node:fs';

type Bang = {
	c: string;
	d: string;
	r: number;
	s: string;
	sc: string;
	t: string;
	u: string;
};

type BangsArray = Bang[];

export async function fetchBangs(source: string): Promise<BangsArray> {
	if (source.startsWith('http')) {
		const response = await fetch(source);
		const data = await response.json();
		return data as BangsArray;
	} else {
		const fileContent = await fs.promises.readFile(source, 'utf8');
		const module = JSON.parse(fileContent);
		return module.bangs;
	}
}

export function createHashMap(bangs: BangsArray): Map<string, Bang> {
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
	const jsContent = `export const bangs = ${JSON.stringify(plainObject, null, 2)};`;
	fs.writeFileSync(outputFile, jsContent);
	console.log(`Hash map written to ${outputFile}`);
}

export async function generateBangsHashMap(source?: string): Promise<void> {
	try {
		source = source || process.argv[2];

		if (!source) {
			console.error('Please provide a URL or local file path as an argument.');
			process.exit(1);
		}

		const bangs = await fetchBangs(source);
		const hashMap = createHashMap(bangs);
		writeHashMapToFile(hashMap, 'bangsHashMap.js');
	} catch (error) {
		console.error('Error:', error instanceof Error ? error.message : 'Unknown error');
	}
}

if (import.meta.url === `file://${process.argv[1]}`) {
	generateBangsHashMap().catch(console.error);
}
