import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { RequestOptions } from 'node:http';
import { fetchPublicPageTitle, isPublicAddress } from './page-title.js';
import { ctx, db } from '../tests/test-setup.js';

const network = { lookup: vi.fn(), http: vi.fn(), https: vi.fn() };

function mockResponse(chunks: Buffer[], statusCode = 200, end = true) {
    const response = Object.assign(new PassThrough(), { statusCode });
    const destroy = vi.fn(() => response.destroy());
    const request = Object.assign(new EventEmitter(), { destroy });
    let requestOptions: RequestOptions | undefined;
    function get(_url: URL, options: RequestOptions, callback: (res: typeof response) => void) {
        requestOptions = options;
        queueMicrotask(() => {
            callback(response);
            for (const chunk of chunks) response.write(chunk);
            if (end) response.end();
        });
        return request;
    }
    network.http.mockImplementation(get);
    network.https.mockImplementation(get);
    return { destroy, request, response, options: () => requestOptions };
}

beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(dns, 'lookup').mockImplementation(network.lookup);
    vi.spyOn(http, 'get').mockImplementation(network.http);
    vi.spyOn(https, 'get').mockImplementation(network.https);
    network.lookup.mockResolvedValue([{ address: '93.184.215.14', family: 4 }]);
});
afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('Public address policy', () => {
    it.each([
        '0.0.0.0',
        '10.1.2.3',
        '100.64.0.1',
        '127.0.0.1',
        '169.254.169.254',
        '172.16.0.1',
        '192.0.0.1',
        '192.0.2.1',
        '192.88.99.1',
        '192.168.1.1',
        '198.18.0.1',
        '198.51.100.1',
        '203.0.113.1',
        '224.0.0.1',
        '255.255.255.255',
        '::',
        '::1',
        '::ffff:127.0.0.1',
        '::ffff:7f00:1',
        '64:ff9b::7f00:1',
        'fc00::1',
        'fe80::1',
        'ff02::1',
        '2001:db8::1',
        '2001::1',
        '2002:7f00:1::',
        '3fff::1',
        'not-an-address',
    ])('should reject non-public address %s', (address) => {
        expect(isPublicAddress(address)).toBe(false);
    });
    it.each(['8.8.8.8', '93.184.215.14', '2606:4700:4700::1111', '2001:4860:4860::8888'])(
        'should allow public address %s',
        (address) => {
            expect(isPublicAddress(address)).toBe(true);
        },
    );
});

describe('Public page title fetching', () => {
    it.each([
        'http://127.1',
        'http://2130706433',
        'http://0x7f000001',
        'http://[::ffff:127.0.0.1]',
        'http://[fe80::1]',
        'file:///tmp/note',
        'ftp://example.com/file',
        'https://user:password@example.com',
    ])('should avoid opening a connection for disallowed URL %s', async (url) => {
        expect(await fetchPublicPageTitle(url)).toBe('Untitled');
        expect(network.http).not.toHaveBeenCalled();
        expect(network.https).not.toHaveBeenCalled();
    });

    it('should reject mixed public and private DNS answers before connecting', async () => {
        network.lookup.mockResolvedValue([
            { address: '93.184.215.14', family: 4 },
            { address: '127.0.0.1', family: 4 },
        ]);
        expect(await fetchPublicPageTitle('https://example.com')).toBe('Untitled');
        expect(network.https).not.toHaveBeenCalled();
    });

    it('should pin a validated DNS answer while preserving the URL hostname and parse split titles', async () => {
        const transport = mockResponse([
            Buffer.from('<html><ti'),
            Buffer.from('tle>Safe '),
            Buffer.from('title</title>'),
        ]);
        expect(await fetchPublicPageTitle('https://example.com/page')).toBe('Safe title');
        expect(network.lookup).toHaveBeenCalledExactlyOnceWith('example.com', {
            all: true,
            verbatim: true,
        });
        expect(network.https.mock.calls[0]?.[0].hostname).toBe('example.com');
        const options = transport.options();
        expect(options?.agent).toBe(false);
        const callback = vi.fn();
        options?.lookup?.('example.com', {}, callback);
        expect(callback).toHaveBeenLastCalledWith(null, '93.184.215.14', 4);
        options?.lookup?.('example.com', { all: true }, callback);
        expect(callback).toHaveBeenLastCalledWith(null, [{ address: '93.184.215.14', family: 4 }]);
        expect(network.lookup).toHaveBeenCalledTimes(1);
        expect(transport.destroy).toHaveBeenCalled();
    });

    it('should not follow redirects to another destination', async () => {
        mockResponse([], 302);
        expect(await fetchPublicPageTitle('https://example.com')).toBe('Untitled');
        expect(network.https).toHaveBeenCalledTimes(1);
        expect(network.http).not.toHaveBeenCalled();
    });

    it('should abort responses larger than the byte limit', async () => {
        const transport = mockResponse([Buffer.alloc(256 * 1024 + 1, 'x')], 200, false);
        expect(await fetchPublicPageTitle('http://example.com')).toBe('Untitled');
        expect(transport.destroy).toHaveBeenCalled();
    });

    it('should abort stalled responses at the absolute deadline', async () => {
        vi.useFakeTimers();
        const transport = mockResponse([Buffer.from('<html>')], 200, false);
        const result = fetchPublicPageTitle('http://example.com');
        for (let i = 0; i < 4; i++) {
            await vi.advanceTimersByTimeAsync(1000);
            transport.response.write(Buffer.from('still waiting'));
        }
        await vi.advanceTimersByTimeAsync(1001);
        expect(await result).toBe('Untitled');
        expect(transport.destroy).toHaveBeenCalled();
    });

    it('should bound DNS resolution and not connect if it completes after the deadline', async () => {
        vi.useFakeTimers();
        let resolveDns: ((value: Array<{ address: string; family: number }>) => void) | undefined;
        network.lookup.mockReturnValue(
            new Promise((resolve) => {
                resolveDns = resolve;
            }),
        );
        const result = fetchPublicPageTitle('http://example.com');
        await vi.advanceTimersByTimeAsync(5001);
        expect(await result).toBe('Untitled');
        resolveDns?.([{ address: '93.184.215.14', family: 4 }]);
        await Promise.resolve();
        expect(network.http).not.toHaveBeenCalled();
    });

    it('should preserve an internal bookmark without fetching its title', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('')));
        const url = 'http://127.0.0.1/internal-bookmark';
        await ctx.utils.util.insertBookmark({ url, userId: 1 });
        await vi.waitFor(async () => {
            const bookmark = await db('bookmarks').where({ user_id: 1, url }).first();
            expect(bookmark?.title).toBe('Untitled');
        });
        expect(network.http).not.toHaveBeenCalled();
        expect(network.https).not.toHaveBeenCalled();
    });

    it('should contain DNS failures and connection errors', async () => {
        network.lookup.mockRejectedValueOnce(new Error('DNS failed'));
        expect(await fetchPublicPageTitle('http://example.com')).toBe('Untitled');
        const transport = mockResponse([], 200, false);
        const result = fetchPublicPageTitle('http://example.com');
        await Promise.resolve();
        transport.request.emit('error', new Error('Connection failed'));
        expect(await result).toBe('Untitled');
    });
});
