import request from 'supertest';
import { db } from './test-setup';
import type { UrlObject } from 'url';
import type { AppContext } from '../type';
import { createContext } from '../context';
import type { Application } from 'express';
import type { SuperTest, Test } from 'supertest';

let testContext: AppContext | null = null;

async function getTestContext(): Promise<AppContext> {
    if (!testContext) {
        testContext = await createContext();
    }
    return testContext;
}

export async function ensureTestUserExists(email: string = 'test@example.com') {
    let user = await db('users').where({ email }).first();

    if (!user) {
        try {
            const username = email.split('@')[0];
            [user] = await db('users')
                .insert({
                    username,
                    email,
                    is_admin: false,
                    autocomplete_search_on_homepage: false,
                    default_search_provider: 'duckduckgo',
                    column_preferences: JSON.stringify({
                        bookmarks: {
                            title: true,
                            url: true,
                            default_per_page: 10,
                            created_at: true,
                            pinned: true,
                        },
                        actions: {
                            name: true,
                            trigger: true,
                            url: true,
                            default_per_page: 10,
                            last_read_at: true,
                            usage_count: true,
                            created_at: true,
                        },
                        notes: {
                            title: true,
                            content: true,
                            default_per_page: 10,
                            created_at: true,
                            pinned: true,
                            view_type: 'table',
                        },
                        tabs: {
                            title: true,
                            trigger: true,
                            items_count: true,
                            default_per_page: 10,
                            created_at: true,
                        },
                        reminders: {
                            title: true,
                            content: true,
                            due_date: true,
                            frequency: true,
                            default_per_page: 10,
                            created_at: true,
                            default_reminder_timing: 'daily',
                            default_reminder_time: '09:00',
                        },
                        users: {
                            username: true,
                            email: true,
                            is_admin: true,
                            default_per_page: 10,
                            email_verified_at: true,
                            created_at: true,
                        },
                    }),
                })
                .returning('*');
        } catch (error) {
            user = await db('users').where({ email }).first();
            if (!user) throw error;
        }
    }

    return user;
}

async function wrapAgentWithCsrf(agent: SuperTest<Test>, getCsrfToken: () => Promise<string>) {
    const originalPost = agent.post.bind(agent) as (url: string | URL | UrlObject) => Test;
    const originalPut = agent.put.bind(agent) as (url: string | URL | UrlObject) => Test;
    const originalPatch = agent.patch.bind(agent) as (url: string | URL | UrlObject) => Test;
    const originalDelete = agent.delete.bind(agent) as (url: string | URL | UrlObject) => Test;

    const csrfToken = await getCsrfToken();

    agent.post = function (url: string | URL | UrlObject) {
        const req = originalPost(url);
        const originalSend = req.send.bind(req);
        req.send = function (data: any) {
            const urlString = typeof url === 'string' ? url : url.toString();
            if (csrfToken && typeof data === 'object' && !urlString.startsWith('/api/')) {
                data.csrfToken = csrfToken;
                if (process.env.DEBUG_CSRF) {
                    console.log(
                        'Adding CSRF token to POST data:',
                        csrfToken.substring(0, 20) + '...',
                    );
                }
            }
            return originalSend(data);
        };
        return req;
    };

    agent.put = function (url: string | URL | UrlObject) {
        const req = originalPut(url);
        const originalSend = req.send.bind(req);
        req.send = function (data: any) {
            const urlString = typeof url === 'string' ? url : url.toString();
            if (csrfToken && typeof data === 'object' && !urlString.startsWith('/api/')) {
                data.csrfToken = csrfToken;
            }
            return originalSend(data);
        };
        return req;
    };

    agent.patch = function (url: string | URL | UrlObject) {
        const req = originalPatch(url);
        const originalSend = req.send.bind(req);
        req.send = function (data: any) {
            const urlString = typeof url === 'string' ? url : url.toString();
            if (csrfToken && typeof data === 'object' && !urlString.startsWith('/api/')) {
                data.csrfToken = csrfToken;
            }
            return originalSend(data);
        };
        return req;
    };

    agent.delete = function (url: string | URL | UrlObject) {
        const req = originalDelete(url);
        const originalSend = req.send.bind(req);
        req.send = function (data: any) {
            const urlString = typeof url === 'string' ? url : url.toString();
            if (csrfToken && typeof data === 'object' && !urlString.startsWith('/api/')) {
                data.csrfToken = csrfToken;
            }
            return originalSend(data);
        };
        return req;
    };

    return agent;
}

export async function authenticateAgent(app: Application, email: string = 'test@example.com') {
    const user = await ensureTestUserExists(email);
    const agent = request.agent(app);
    const ctx = await getTestContext();
    const token = ctx.utils.auth.generateMagicLink({ email });
    await agent.get(`/auth/magic/${token}`).expect(302);

    const getCsrfToken = async () => {
        // Make a GET request to any page to get the CSRF token
        // Use /reminders which should be accessible for authenticated users
        const res = await agent.get('/reminders');
        // Extract CSRF token from the HTML (looking for hidden input or meta tag)
        const csrfMatch =
            res.text.match(/name="csrfToken"\s+value="([^"]+)"/) ||
            res.text.match(/data-csrf="([^"]+)"/) ||
            res.text.match(/csrfToken['"]:\s*['"]([^'"]+)['"]/);
        return csrfMatch ? csrfMatch[1] : '';
    };

    await wrapAgentWithCsrf(agent, getCsrfToken);

    return { agent, user };
}

export async function cleanupTestData() {
    try {
        await db.transaction(async (trx) => {
            const testUsers = await trx('users')
                .where('email', 'like', '%@example.com')
                .select('id');
            const userIds = testUsers.map((u) => u.id);

            if (userIds.length > 0) {
                await Promise.all([
                    trx('bangs')
                        .whereIn('user_id', userIds)
                        .del()
                        .catch(() => {}),
                    trx('bookmarks')
                        .whereIn('user_id', userIds)
                        .del()
                        .catch(() => {}),
                    trx('notes')
                        .whereIn('user_id', userIds)
                        .del()
                        .catch(() => {}),
                    trx('tabs')
                        .whereIn('user_id', userIds)
                        .del()
                        .catch(() => {}),
                    trx('reminders')
                        .whereIn('user_id', userIds)
                        .del()
                        .catch(() => {}),
                    trx('sessions')
                        .where('sess', 'like', '%test@example.com%')
                        .del()
                        .catch(() => {}),
                ]);

                await trx('users').whereIn('id', userIds).del();
            }
        });
    } catch (error) {
        // Silent cleanup
    }
}

export async function cleanupTestDatabase() {
    try {
        const fs = await import('node:fs/promises');
        const dbConfig = db.client.config.connection as { filename: string };
        if (dbConfig.filename && dbConfig.filename.includes('test-')) {
            await fs.unlink(dbConfig.filename);
            await fs.unlink(dbConfig.filename + '-wal');
            await fs.unlink(dbConfig.filename + '-shm');
        }
    } catch (error) {
        // ...
    }
}

export async function createUnauthenticatedAgent(app: Application) {
    const agent = request.agent(app); // agent maintains session cookies

    const getCsrfToken = async () => {
        const response = await agent.get('/');
        const csrfMatch =
            response.text.match(/name="csrfToken"\s+value="([^"]+)"/) ||
            response.text.match(/data-csrf="([^"]+)"/) ||
            response.text.match(/csrfToken['"]:\s*['"]([^'"]+)['"]/);
        return csrfMatch ? csrfMatch[1] : '';
    };

    await wrapAgentWithCsrf(agent, getCsrfToken);

    return agent;
}

export async function authenticateApiAgent(app: Application, email: string = 'test@example.com') {
    const user = await ensureTestUserExists(email);

    const ctx = await getTestContext();
    const apiKeyVersion = 1;
    const apiKey = await ctx.utils.auth.generateApiKey({ userId: user.id, apiKeyVersion });

    await db('users').where({ id: user.id }).update({
        api_key: apiKey,
        api_key_version: apiKeyVersion,
        api_key_created_at: new Date().toISOString(),
    });

    const agent = request.agent(app);

    const originalGet = agent.get.bind(agent) as (url: string | URL | UrlObject) => Test;
    const originalPost = agent.post.bind(agent) as (url: string | URL | UrlObject) => Test;
    const originalPut = agent.put.bind(agent) as (url: string | URL | UrlObject) => Test;
    const originalDelete = agent.delete.bind(agent) as (url: string | URL | UrlObject) => Test;

    agent.get = function (url: string | URL | UrlObject) {
        return originalGet(url)
            .set('Authorization', `Bearer ${apiKey}`)
            .set('Accept', 'application/json');
    };

    agent.post = function (url: string | URL | UrlObject) {
        return originalPost(url)
            .set('Authorization', `Bearer ${apiKey}`)
            .set('Accept', 'application/json')
            .set('Content-Type', 'application/json');
    };

    agent.put = function (url: string | URL | UrlObject) {
        return originalPut(url)
            .set('Authorization', `Bearer ${apiKey}`)
            .set('Accept', 'application/json')
            .set('Content-Type', 'application/json');
    };

    agent.delete = function (url: string | URL | UrlObject) {
        return originalDelete(url)
            .set('Authorization', `Bearer ${apiKey}`)
            .set('Accept', 'application/json');
    };

    return { agent, user };
}
