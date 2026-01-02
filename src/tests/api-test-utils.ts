import request from 'supertest';
import { db, ctx, createTestUser } from './test-setup';
import type { UrlObject } from 'url';
import type { Test } from 'supertest';
import type { Application } from 'express';

type Agent = ReturnType<typeof request.agent>;
type UrlArg = string | URL | UrlObject;

function extractCsrfToken(html: string): string {
    const match =
        html.match(/name="csrfToken"\s+value="([^"]+)"/) ||
        html.match(/data-csrf="([^"]+)"/) ||
        html.match(/csrfToken['"]:\s*['"]([^'"]+)['"]/);
    return match?.[1] ?? '';
}

async function wrapAgentWithCsrf(agent: Agent, csrfPage: string) {
    const res = await agent.get(csrfPage);
    const csrfToken = extractCsrfToken(res.text);

    for (const method of ['post', 'put', 'patch', 'delete'] as const) {
        const original = agent[method].bind(agent) as (url: UrlArg) => Test;
        agent[method] = function (url: UrlArg) {
            const req = original(url);
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
    }
}

async function authenticateWithMagicLink(app: Application, email: string, isAdmin: boolean) {
    const user = await createTestUser(email, isAdmin);
    const agent = request.agent(app);
    const token = ctx.utils.auth.generateMagicLink({ email });
    await agent.get(`/auth/magic/${token}`).expect(302);
    await wrapAgentWithCsrf(agent, '/reminders');
    return { agent, user };
}

export async function authenticateAgent(app: Application) {
    return authenticateWithMagicLink(app, 'test@example.com', false);
}

export async function authenticateAdminAgent(app: Application) {
    return authenticateWithMagicLink(app, 'admin@example.com', true);
}

export async function createUnauthenticatedAgent(app: Application) {
    const agent = request.agent(app);
    await wrapAgentWithCsrf(agent, '/');
    return agent;
}

export async function authenticateApiAgent(app: Application) {
    const user = await createTestUser('test@example.com', false);

    const apiKeyVersion = 1;
    const apiKey = await ctx.utils.auth.generateApiKey({ userId: user.id, apiKeyVersion });

    await db('users').where({ id: user.id }).update({
        api_key: apiKey,
        api_key_version: apiKeyVersion,
        api_key_created_at: new Date().toISOString(),
    });

    const agent = request.agent(app);

    for (const method of ['get', 'post', 'put', 'delete'] as const) {
        const original = agent[method].bind(agent) as (url: UrlArg) => Test;
        const needsContentType = method === 'post' || method === 'put';
        agent[method] = function (url: UrlArg) {
            let req = original(url)
                .set('Authorization', `Bearer ${apiKey}`)
                .set('Accept', 'application/json');
            if (needsContentType) {
                req = req.set('Content-Type', 'application/json');
            }
            return req;
        };
    }

    return { agent, user };
}
