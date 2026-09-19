import dns from 'node:dns/promises';
import http from 'node:http';
import https from 'node:https';
import type { ClientRequest } from 'node:http';
import { BlockList, isIP } from 'node:net';
import { StringDecoder } from 'node:string_decoder';

const TITLE_FETCH_TIMEOUT_MS = 5000;

const TITLE_FETCH_MAX_BYTES = 256 * 1024;

const REGEX_TITLE = /<title\b[^>]*>([^<]*)<\/title\s*>/i;

const PUBLIC_IPV6 = new BlockList();

PUBLIC_IPV6.addSubnet('2000::', 3, 'ipv6');

const NON_PUBLIC_ADDRESSES = new BlockList();

const IPV4_EXCLUSIONS: Array<[string, number]> = [
    ['0.0.0.0', 8],
    ['10.0.0.0', 8],
    ['100.64.0.0', 10],
    ['127.0.0.0', 8],
    ['169.254.0.0', 16],
    ['172.16.0.0', 12],
    ['192.0.0.0', 24],
    ['192.0.2.0', 24],
    ['192.88.99.0', 24],
    ['192.168.0.0', 16],
    ['198.18.0.0', 15],
    ['198.51.100.0', 24],
    ['203.0.113.0', 24],
    ['224.0.0.0', 4],
    ['240.0.0.0', 4],
];

for (const [address, prefix] of IPV4_EXCLUSIONS)
    NON_PUBLIC_ADDRESSES.addSubnet(address, prefix, 'ipv4');

// Exclude special-purpose, transition/tunnel, and documentation ranges within global unicast.
for (const [address, prefix] of [
    ['2001::', 23],
    ['2001:db8::', 32],
    ['2002::', 16],
    ['3fff::', 20],
] satisfies Array<[string, number]>) {
    NON_PUBLIC_ADDRESSES.addSubnet(address, prefix, 'ipv6');
}

export function isPublicAddress(address: string): boolean {
    const family = isIP(address);

    if (family === 4) return !NON_PUBLIC_ADDRESSES.check(address, 'ipv4');

    // Also excludes IPv4-mapped/translated IPv6, local, multicast and unallocated ranges.
    return (
        family === 6 &&
        PUBLIC_IPV6.check(address, 'ipv6') &&
        !NON_PUBLIC_ADDRESSES.check(address, 'ipv6')
    );
}

export async function fetchPublicPageTitle(rawUrl: string): Promise<string> {
    let url: URL;

    try {
        url = new URL(rawUrl);
    } catch {
        return 'Untitled';
    }

    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || url.username || url.password)
        return 'Untitled';

    return new Promise<string>((resolve) => {
        let request: ClientRequest | undefined;
        let settled = false;
        const deadline = setTimeout(() => finish(), TITLE_FETCH_TIMEOUT_MS);

        function finish(title = 'Untitled') {
            if (settled) return;
            settled = true;
            clearTimeout(deadline);
            request?.destroy();
            resolve(title);
        }

        async function fetchTitle() {
            const hostname = url.hostname.startsWith('[')
                ? url.hostname.slice(1, -1)
                : url.hostname;

            const family = isIP(hostname);

            const addresses = family
                ? [{ address: hostname, family }]
                : await dns.lookup(hostname, { all: true, verbatim: true });

            if (settled) return;
            const address = addresses[0];

            if (!address || addresses.some((entry) => !isPublicAddress(entry.address))) {
                finish();

                return;
            }

            const get = url.protocol === 'https:' ? https.get : http.get;
            request = get(
                url,
                {
                    agent: false,
                    // Pin the validated answer: the socket never resolves the hostname again.
                    lookup(_hostname, options, callback) {
                        if (options.all) callback(null, [address]);
                        else callback(null, address.address, address.family);
                    },
                    headers: {
                        Accept: 'text/html',
                        'User-Agent': 'Bang/1.0 (https://github.com/wajeht/bang)',
                    },
                },
                (response) => {
                    response.on('error', () => finish());
                    response.on('aborted', () => finish());

                    if (response.statusCode !== 200) {
                        finish();

                        return;
                    }

                    let bytes = 0;
                    let content = '';
                    const decoder = new StringDecoder('utf8');
                    response.on('data', (chunk: Buffer) => {
                        bytes += chunk.length;

                        if (bytes > TITLE_FETCH_MAX_BYTES) {
                            finish();

                            return;
                        }

                        content += decoder.write(chunk);
                        const match = REGEX_TITLE.exec(content);

                        if (match?.[1]) finish(match[1].slice(0, 100).trim());
                    });
                    response.on('end', () => finish());
                },
            );
            request.on('error', () => finish());
        }

        void fetchTitle().catch(() => finish());
    });
}
