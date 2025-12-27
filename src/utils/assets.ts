import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export type AssetVersions = {
    style: string;
    script: string;
};

export function AssetUtils() {
    const HASH_LENGTH = 8;
    const PUBLIC_DIR = path.resolve('./public');
    const hashCache = new Map<string, string>();
    let cachedVersions: AssetVersions | null = null;

    function computeFileHash(filePath: string): string {
        const cached = hashCache.get(filePath);
        if (cached) return cached;

        const absolutePath = path.resolve(PUBLIC_DIR, filePath);
        const content = fs.readFileSync(absolutePath);
        const hash = crypto.createHash('md5').update(content).digest('hex').slice(0, HASH_LENGTH);
        hashCache.set(filePath, hash);
        return hash;
    }

    function getAssetVersions(): AssetVersions {
        if (cachedVersions) return cachedVersions;

        cachedVersions = {
            style: computeFileHash('style.css'),
            script: computeFileHash('script.js'),
        };
        return cachedVersions;
    }

    return {
        computeFileHash,
        getAssetVersions,
    };
}
