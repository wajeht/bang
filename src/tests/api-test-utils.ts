import request from './hono-test-client.js';
import { db, ctx, createTestUser } from './test-setup.js';
import type { HonoTestAgent, HonoTestRequestChain } from './hono-test-client.js';
import type { createHonoApp } from '../http.js';

type Agent = HonoTestAgent;
type HttpMethod = 'get' | 'post' | 'put' | 'patch' | 'delete';
type TestApp = ReturnType<typeof createHonoApp>;

function extractCsrfToken(html: string): string {
    const match =
        html.match(/name="csrfToken"\s+value="([^"]+)"/) ||
        html.match(/data-csrf="([^"]+)"/) ||
        html.match(/csrfToken['"]:\s*['"]([^'"]+)['"]/);
    return match?.[1] ?? '';
}

function wrapMethods<T extends HttpMethod>(
    agent: Agent,
    methods: readonly T[],
    wrap: (req: HonoTestRequestChain, method: T) => HonoTestRequestChain,
) {
    for (const method of methods) {
        const original = agent[method].bind(agent);
        agent[method] = (url: string) => wrap(original(url), method);
    }
}

async function addCsrfToAgent(agent: Agent, csrfPage: string) {
    const { text } = await agent.get(csrfPage);
    const csrfToken = extractCsrfToken(text);

    wrapMethods(agent, ['post', 'put', 'patch', 'delete'] as const, (req, _method) => {
        const originalSend = req.send.bind(req);
        req.send = (data: Record<string, unknown>) => {
            if (csrfToken && typeof data === 'object') {
                data.csrfToken = csrfToken;
            }
            return originalSend(data);
        };
        return req;
    });
}

export interface AuthOptions {
    admin?: boolean;
    email?: string;
}

export async function authenticateAgent(app: TestApp, options: AuthOptions = {}) {
    const { admin = false, email = admin ? 'admin@example.com' : 'test@example.com' } = options;

    const user = await createTestUser(email, admin);
    const agent = request.agent(app);
    const token = ctx.utils.auth.generateMagicLink({ email });

    await agent.get(`/auth/magic/${token}`).expect(302);
    await addCsrfToAgent(agent, '/reminders');

    return { agent, user };
}

export const authenticateAdminAgent = (app: TestApp) => authenticateAgent(app, { admin: true });

export async function createUnauthenticatedAgent(app: TestApp) {
    const agent = request.agent(app);
    await addCsrfToAgent(agent, '/');
    return agent;
}

export async function authenticateApiAgent(app: TestApp) {
    const user = await createTestUser('test@example.com', false);

    const apiKeyVersion = 1;
    const apiKey = await ctx.utils.auth.generateApiKey({ userId: user.id, apiKeyVersion });

    await db('users').where({ id: user.id }).update({
        api_key: apiKey,
        api_key_version: apiKeyVersion,
        api_key_created_at: new Date().toISOString(),
    });

    const agent = request.agent(app);

    wrapMethods(agent, ['get', 'post', 'put', 'delete'] as const, (req, method) => {
        let r = req.set('Authorization', `Bearer ${apiKey}`).set('Accept', 'application/json');

        if (method === 'post' || method === 'put') {
            r = r.set('Content-Type', 'application/json');
        }
        return r;
    });

    return { agent, user };
}
