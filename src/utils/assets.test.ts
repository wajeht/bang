import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { AssetUtils } from './assets';
import { describe, expect, it, afterAll } from 'vitest';

const assetUtils = AssetUtils();

describe.concurrent('AssetUtils', () => {
    describe.concurrent('computeFileHash', () => {
        it('should return 8-char hex string and be consistent', () => {
            const hash1 = assetUtils.computeFileHash('style.css');
            const hash2 = assetUtils.computeFileHash('style.css');
            expect(hash1).toMatch(/^[a-f0-9]{8}$/);
            expect(hash1).toBe(hash2);
        });

        it('should return different hashes for different files', () => {
            const styleHash = assetUtils.computeFileHash('style.css');
            const scriptHash = assetUtils.computeFileHash('script.js');
            expect(styleHash).not.toBe(scriptHash);
        });

        it('should match manually computed MD5 hash', () => {
            const content = fs.readFileSync(path.resolve('./public/style.css'));
            const expected = crypto.createHash('md5').update(content).digest('hex').slice(0, 8);
            expect(assetUtils.computeFileHash('style.css')).toBe(expected);
        });

        it('should throw error for non-existent file', () => {
            expect(() => AssetUtils().computeFileHash('nonexistent.css')).toThrow();
        });
    });

    describe.concurrent('getAssetVersions', () => {
        it('should return style and script as 8-char hex strings', () => {
            const versions = assetUtils.getAssetVersions();
            expect(versions).toHaveProperty('style');
            expect(versions).toHaveProperty('script');
            expect(versions.style).toMatch(/^[a-f0-9]{8}$/);
            expect(versions.script).toMatch(/^[a-f0-9]{8}$/);
        });

        it('should return consistent versions (cached)', () => {
            const v1 = assetUtils.getAssetVersions();
            const v2 = assetUtils.getAssetVersions();
            expect(v1).toBe(v2);
        });
    });

    describe('caching behavior', () => {
        const testFilePath = path.resolve('./public/test-asset.txt');

        afterAll(() => {
            if (fs.existsSync(testFilePath)) {
                fs.unlinkSync(testFilePath);
            }
        });

        it('should cache hash and detect changes with fresh instance', () => {
            fs.writeFileSync(testFilePath, 'content-a');
            const utils1 = AssetUtils();
            const hash1 = utils1.computeFileHash('test-asset.txt');

            fs.writeFileSync(testFilePath, 'content-b');
            const hash1Cached = utils1.computeFileHash('test-asset.txt');
            const hash2Fresh = AssetUtils().computeFileHash('test-asset.txt');

            expect(hash1).toBe(hash1Cached);
            expect(hash1).not.toBe(hash2Fresh);
        });
    });
});
