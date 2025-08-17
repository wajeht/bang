import { db } from '../db/db';
import request from 'supertest';
import { magicLink } from '../utils/util';
import type { Application } from 'express';

export async function ensureTestUserExists(
    email: string = 'test@example.com',
    isAdmin: boolean = false,
) {
    // Always create a fresh user for each test to ensure isolation
    try {
        // First, delete any existing user with this email to ensure clean state
        await db('users').where({ email }).del();

        const username = email.split('@')[0];
        const [user] = await db('users')
            .insert({
                username,
                email,
                is_admin: isAdmin,
                email_verified_at: db.fn.now(),
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

        return user;
    } catch (error) {
        console.error('Error creating test user:', error);
        throw error;
    }
}

export async function authenticateUserWithMagicLink(
    app: Application,
    email: string = 'test@example.com',
    isAdmin: boolean = false,
) {
    const user = await ensureTestUserExists(email, isAdmin);
    const token = magicLink.generate({ email });

    const agent = request.agent(app);

    // Visit the magic link to authenticate
    const response = await agent.get(`/auth/magic/${token}`);

    // The magic link should redirect to /actions after successful authentication
    if (response.status === 302 && response.headers.location === '/actions') {
        // Get the CSRF token from the session
        const csrfResponse = await agent.get('/actions');
        let csrfToken = csrfResponse.text.match(/name="csrfToken" value="([^"]+)"/)?.[1];

        // If not found in form, try to get it from the response body or session
        if (!csrfToken) {
            // Try to get it from the response body if it's JSON
            if (csrfResponse.type.includes('json') && csrfResponse.body?.csrfToken) {
                csrfToken = csrfResponse.body.csrfToken;
            } else {
                // Try to get it from the session by making a request to a route that sets it
                const tokenResponse = await agent.get('/');
                csrfToken = tokenResponse.text.match(/name="csrfToken" value="([^"]+)"/)?.[1];
            }
        }

        if (!csrfToken) {
            throw new Error('Failed to extract CSRF token');
        }

        // Authentication successful
        return { agent, user, csrfToken };
    }

    throw new Error(`Failed to authenticate user: ${email}`);
}

export async function createAuthenticatedAgent(
    app: Application,
    email: string = 'test@example.com',
    isAdmin: boolean = false,
) {
    const { agent, user, csrfToken } = await authenticateUserWithMagicLink(app, email, isAdmin);
    return { agent, user, csrfToken };
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
                        .where('sess', 'like', '%@example.com%')
                        .del()
                        .catch(() => {}),
                ]);

                await trx('users').whereIn('id', userIds).del();
            }
        });
    } catch (error) {
        console.error('Error cleaning up test data:', error);
    }
}

export async function createTestUser(email: string, isAdmin: boolean = false) {
    return ensureTestUserExists(email, isAdmin);
}

export async function deleteTestUser(email: string) {
    const user = await db('users').where({ email }).first();
    if (user) {
        await db('users').where({ id: user.id }).delete();
    }
}
