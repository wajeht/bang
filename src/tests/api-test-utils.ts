import request from 'supertest';
import { db, ctx } from './test-setup';
import type { UrlObject } from 'url';
import type { Test } from 'supertest';
import type { Application } from 'express';

async function getOrCreateTestUser(email: string = 'test@example.com', isAdmin: boolean = false) {
    let user = await db('users').where({ email }).first();

    if (!user) {
        const username = email.split('@')[0];
        [user] = await db('users')
            .insert({
                username,
                email,
                is_admin: isAdmin,
                default_search_provider: 'duckduckgo',
                theme: 'system',
            })
            .onConflict('email')
            .ignore()
            .returning('*');

        // If insert was ignored due to conflict, fetch the existing user
        if (!user) {
            user = await db('users').where({ email }).first();
        }
    }

    // Update is_admin if needed (e.g., for admin tests)
    if (isAdmin && !user.is_admin) {
        await db('users').where({ id: user.id }).update({ is_admin: true });
        user.is_admin = true;
    }

    return user;
}

async function wrapAgentWithCsrf(
    agent: ReturnType<typeof request.agent>,
    getCsrfToken: () => Promise<string>,
) {
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
    const user = await getOrCreateTestUser(email);
    const agent = request.agent(app);
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

export async function authenticateAdminAgent(
    app: Application,
    email: string = 'admin@example.com',
) {
    const user = await getOrCreateTestUser(email, true);
    const agent = request.agent(app);
    const token = ctx.utils.auth.generateMagicLink({ email });
    await agent.get(`/auth/magic/${token}`).expect(302);

    const getCsrfToken = async () => {
        const res = await agent.get('/reminders');
        const csrfMatch =
            res.text.match(/name="csrfToken"\s+value="([^"]+)"/) ||
            res.text.match(/data-csrf="([^"]+)"/) ||
            res.text.match(/csrfToken['"]:\s*['"]([^'"]+)['"]/);
        return csrfMatch ? csrfMatch[1] : '';
    };

    await wrapAgentWithCsrf(agent, getCsrfToken);

    return { agent, user };
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
    const user = await getOrCreateTestUser(email);

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
