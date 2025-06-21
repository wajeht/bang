#!/usr/bin/env tsx

import { api } from '../src/util.js';
import { db, optimizeDatabase, checkDatabaseHealth } from '../src/db/db.js';
import type { User } from '../src/type.js';

const CONFIG = {
    baseUrl: 'http://localhost:80',
    users: 1000, // Increased for production server testing
};

const TESTS = [
    // 🎯 Direct Commands (@) - Navigation
    { name: '@data', path: '/?q=@data' },
    { name: '@admin', path: '/?q=@admin' },
    { name: '@api', path: '/?q=@api' },
    { name: '@b', path: '/?q=@b' },
    { name: '@bangs', path: '/?q=@bangs' },
    { name: '@s', path: '/?q=@s' },
    { name: '@settings', path: '/?q=@settings' },
    { name: '@n', path: '/?q=@n' },
    { name: '@note', path: '/?q=@note' },
    { name: '@notes', path: '/?q=@notes' },
    { name: '@a', path: '/?q=@a' },
    { name: '@action', path: '/?q=@action' },
    { name: '@actions', path: '/?q=@actions' },
    { name: '@bm', path: '/?q=@bm' },
    { name: '@bookmark', path: '/?q=@bookmark' },
    { name: '@bookmarks', path: '/?q=@bookmarks' },

    // 🔍 Direct Commands with Search Terms
    { name: '@bm search', path: '/?q=@bm javascript' },
    { name: '@a search', path: '/?q=@a github' },
    { name: '@n search', path: '/?q=@n tutorial' },

    // 🔖 System Bang Commands - Bookmark Management
    { name: '!bm url only', path: '/?q=!bm https://example.com' },
    { name: '!bm title+url', path: '/?q=!bm Example Site https://example.com' },
    { name: '!bm long title', path: '/?q=!bm this title can be super long https://bang.jaw.dev' },

    // ⚙️ System Bang Commands - Custom Bang Management
    { name: '!add bang', path: '/?q=!add jaw https://bang.jaw.dev' },
    { name: '!add no prefix', path: '/?q=!add custom https://custom.com' },
    { name: '!del bang', path: '/?q=!del jaw' },
    { name: '!del with !', path: '/?q=!del !jaw' },

    // ✏️ System Bang Commands - Edit Bang
    { name: '!edit trigger', path: '/?q=!edit jaw !newjaw' },
    { name: '!edit url', path: '/?q=!edit jaw https://new-url.com' },
    { name: '!edit both', path: '/?q=!edit jaw !newjaw https://new-url.com' },

    // 📝 System Bang Commands - Note Creation
    {
        name: '!note with title',
        path: '/?q=!note some title | this is a note https://bang.jaw.dev',
    },
    { name: '!note no title', path: '/?q=!note this is content without any title' },

    // 🌐 Built-in Bang Commands (from seeds)
    { name: '!g search', path: '/?q=!g typescript' },
    { name: '!g empty', path: '/?q=!g' },
    { name: '!ddg search', path: '/?q=!ddg nodejs error' },
    { name: '!ddg empty', path: '/?q=!ddg' },
    { name: '!gh redirect', path: '/?q=!gh' },
    { name: '!yt search', path: '/?q=!yt funny videos' },
    { name: '!yt empty', path: '/?q=!yt' },
    { name: '!maps search', path: '/?q=!maps New York' },
    { name: '!maps empty', path: '/?q=!maps' },
    { name: '!w search', path: '/?q=!w JavaScript' },
    { name: '!w empty', path: '/?q=!w' },

    // 🔍 Regular Search Functionality
    { name: 'plain search', path: '/?q=javascript tutorial' },
    { name: 'multi word', path: '/?q=how to learn programming' },
    { name: 'special chars', path: '/?q=react hooks useEffect' },

    // 🚫 Unknown Bang Commands (should fallback to search)
    { name: '!unknown', path: '/?q=!unknown' },
    { name: '!xyz search', path: '/?q=!xyz some query' },

    // 🎭 Edge Cases
    { name: 'empty query', path: '/?q=' },
    { name: 'spaces only', path: '/?q=   ' },
    { name: 'special chars', path: '/?q=@#$%^&*()' },
];

async function request(url: string, apiKey?: string) {
    try {
        const headers = apiKey ? { Authorization: `Bearer ${apiKey}` } : {};
        const controller = new AbortController();
        setTimeout(() => controller.abort(), 5000);
        const response = await fetch(url, {
            headers,
            signal: controller.signal,
            redirect: 'manual',
        });
        return {
            ok: response.ok || (response.status >= 300 && response.status < 400),
            status: response.status,
            url,
        };
    } catch (error) {
        return { ok: false, status: 0, url, error: String(error) };
    }
}

async function createUsers(): Promise<Array<{ user: User; apiKey: string }>> {
    console.log(`📝 Creating ${CONFIG.users} test users...`);
    const users = [];

    // Get action types for bangs
    const actionTypes = await db('action_types').select('*');
    const searchType = actionTypes.find((type) => type.name === 'search');
    const redirectType = actionTypes.find((type) => type.name === 'redirect');

    if (!searchType || !redirectType) {
        throw new Error('Required action types not found');
    }

    for (let i = 0; i < CONFIG.users; i++) {
        const email = `load-test-${i}@bang.local`;

        let user = await db('users').where({ email }).first();
        if (!user) {
            const [result] = await db('users')
                .insert({
                    email,
                    username: `load-test-${i}`,
                    default_search_provider: 'duckduckgo',
                    created_at: db.fn.now(),
                    updated_at: db.fn.now(),
                })
                .returning('id');
            const userId = typeof result === 'object' ? result.id : result;
            user = await db('users').where({ id: userId }).first();

            // Create sample bangs for each user (like seeds)
            if (user?.id) {
                const bangs = [
                    {
                        user_id: user.id,
                        trigger: '!g',
                        name: 'Google Search',
                        action_type_id: searchType.id,
                        url: 'https://www.google.com/search?q={query}',
                    },
                    {
                        user_id: user.id,
                        trigger: '!ddg',
                        name: 'DuckDuckGo Search',
                        action_type_id: searchType.id,
                        url: 'https://duckduckgo.com/?q={query}',
                    },
                    {
                        user_id: user.id,
                        trigger: '!gh',
                        name: 'GitHub',
                        action_type_id: redirectType.id,
                        url: 'https://github.com',
                    },
                    {
                        user_id: user.id,
                        trigger: '!yt',
                        name: 'YouTube Search',
                        action_type_id: searchType.id,
                        url: 'https://www.youtube.com/results?search_query={query}',
                    },
                    {
                        user_id: user.id,
                        trigger: '!maps',
                        name: 'Google Maps',
                        action_type_id: searchType.id,
                        url: 'https://www.google.com/maps/search/{query}',
                    },
                    {
                        user_id: user.id,
                        trigger: '!w',
                        name: 'Wikipedia',
                        action_type_id: searchType.id,
                        url: 'https://en.wikipedia.org/wiki/Special:Search/{query}',
                    },
                ];

                await db('bangs').insert(bangs);

                // Create sample bookmarks
                const bookmarks = [
                    {
                        user_id: user.id,
                        url: 'https://github.com',
                        title: 'GitHub',
                    },
                    {
                        user_id: user.id,
                        url: 'https://developer.mozilla.org',
                        title: 'MDN Web Docs',
                    },
                ];

                await db('bookmarks').insert(bookmarks);

                // Create sample notes
                const notes = [
                    {
                        user_id: user.id,
                        title: 'Test Note',
                        content: 'This is a test note for load testing',
                    },
                ];

                await db('notes').insert(notes);
            }
        }

        if (!user) throw new Error('Failed to create user');

        const apiKey = await api.generate({ userId: user.id, apiKeyVersion: 1 });
        await db('users').where({ id: user.id }).update({
            api_key: apiKey,
            api_key_version: 1,
        });

        users.push({ user, apiKey });
    }

    console.log(`✅ Ready with ${users.length} test users`);
    return users;
}

async function runTest(test: any, users: Array<{ user: User; apiKey: string }>) {
    const start = Date.now();

    const promises = [];
    for (let i = 0; i < users.length; i++) {
        const user = users[i]!;
        const url = `${CONFIG.baseUrl}${test.path}`;
        promises.push(request(url, user.apiKey));
    }

    const results = await Promise.all(promises);
    const duration = (Date.now() - start) / 1000;
    const successful = results.filter((r) => r.ok).length;
    const rps = results.length / duration;
    const success = (successful / results.length) * 100;

    // Show status codes for first few requests
    const statusCodes = results
        .slice(0, 3)
        .map((r) => r.status)
        .join(', ');

    if (success < 100) {
        console.log(
            `  ❌ ${test.name.padEnd(20)}: ${successful}/${results.length} (${success.toFixed(1)}%) [${statusCodes}] - ${rps.toFixed(1)} req/s`,
        );
    } else {
        console.log(
            `  ✅ ${test.name.padEnd(20)}: ${successful}/${results.length} (${success.toFixed(1)}%) [${statusCodes}] - ${rps.toFixed(1)} req/s`,
        );
    }

    return { name: test.name, successful, total: results.length, rps, success, statusCodes };
}

async function cleanup() {
    console.log('─'.repeat(50));
    console.log('🗑️  Cleaning up...');
    const users = await db('users').where('email', 'like', 'load-test-%@bang.local').select('id');
    if (users.length > 0) {
        const ids = users.map((u) => u.id);

        // Clean up in proper order due to foreign key constraints
        await db('bookmarks').whereIn('user_id', ids).del();
        await db('bangs').whereIn('user_id', ids).del();
        await db('notes').whereIn('user_id', ids).del();
        await db('users').whereIn('id', ids).del();

        console.log(`✅ Removed ${users.length} test users and their data`);
    } else {
        console.log('✅ No test users to clean up');
    }
}

async function main() {
    console.log('═'.repeat(50));
    console.log('🚀 Bang Load Test');
    console.log(`URL: ${CONFIG.baseUrl}, Users: ${CONFIG.users}`);
    console.log('═'.repeat(50));
    console.log('');

    // Health check
    const health = await request(`${CONFIG.baseUrl}/healthz`);
    if (!health.ok) {
        console.log('❌ Server health check failed');
        process.exit(1);
    }
    console.log('✅ Server healthy');
    console.log('');

    // Optimize database for high concurrency
    console.log('🔧 Optimizing database for concurrency...');
    await optimizeDatabase();
    await checkDatabaseHealth();
    console.log('✅ Database optimized');
    console.log('');

    // Create test users
    const users = await createUsers();
    console.log('');

    // Run tests
    console.log('─'.repeat(50));
    console.log(`🚀 Running ${TESTS.length} tests...`);
    console.log('─'.repeat(50));
    console.log('');

    const results = [];
    for (const test of TESTS) {
        const result = await runTest(test, users);
        results.push(result);
    }

    // Summary
    console.log('');
    console.log('═'.repeat(50));
    console.log('📊 SUMMARY');
    console.log('═'.repeat(50));
    console.log('');

    const totalReqs = results.reduce((sum, r) => sum + r.total, 0);
    const totalSuccess = results.reduce((sum, r) => sum + r.successful, 0);
    const avgRps = results.reduce((sum, r) => sum + r.rps, 0) / results.length;
    const overallSuccess = (totalSuccess / totalReqs) * 100;
    const passedTests = results.filter((r) => r.success === 100).length;

    console.log(`📈 Total Requests: ${totalReqs}`);
    console.log(`✅ Successful: ${totalSuccess} (${overallSuccess.toFixed(1)}%)`);
    console.log(`🎯 Tests Passed: ${passedTests}/${results.length}`);
    console.log(`⚡ Average Speed: ${avgRps.toFixed(1)} req/s`);
    console.log('');

    console.log('─'.repeat(50));
    console.log('📋 DETAILED RESULTS');
    console.log('─'.repeat(50));
    console.log('');

    results.forEach((r) => {
        const icon = r.success === 100 ? '✅' : '❌';
        console.log(
            `${icon} ${r.name.padEnd(18)}: ${r.success.toFixed(1)}% - ${r.rps.toFixed(1)} req/s`,
        );
    });

    await cleanup();
    console.log('');
    console.log('✨ Load test completed!');
    console.log('═'.repeat(50));
    process.exit(0);
}

main().catch((error) => {
    console.error('❌ Load test failed:', error.message);
    process.exit(1);
});
