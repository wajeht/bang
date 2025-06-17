import { db } from '../../db/db';
import { magicLink } from '../../util';
import { Page, expect } from '@playwright/test';

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
                        },
                        actions: {
                            name: true,
                            trigger: true,
                            url: true,
                            default_per_page: 10,
                            last_read_at: true,
                            created_at: true,
                        },
                        notes: {
                            title: true,
                            content: true,
                            default_per_page: 10,
                            created_at: true,
                            view_type: 'table',
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

export async function authenticateUser(page: Page, email: string = 'test@example.com') {
    const user = await ensureTestUserExists(email);
    const token = magicLink.generate({ email });
    await page.goto(`/auth/magic/${token}`);
    await page.waitForURL('/actions', { timeout: 5000 });
    return user;
}

export async function openLoginDialog(page: Page) {
    await page.goto('/');
    await page.getByRole('link', { name: '🔑 Login' }).click();
    await expect(page.getByText('🚀 Send')).toBeVisible();
}

export async function submitEmailForMagicLink(page: Page, email: string = 'test@example.com') {
    await openLoginDialog(page);
    await page.getByLabel('📧 Email Address').fill(email);
    await page.getByRole('button', { name: '🚀 Send' }).click();
    await page.waitForURL('/', { timeout: 5000 }).catch(() => {});
}

export async function loginUser(page: Page, email: string = 'test@example.com') {
    await authenticateUser(page, email);
    await expect(page).toHaveURL('/actions');
}

export async function expectUserLoggedIn(page: Page) {
    await expect(page).toHaveURL('/actions');
    await expect(page.locator('body')).toContainText('Welcome');
}

export async function expectUserLoggedOut(page: Page) {
    await expect(page.getByRole('link', { name: '🔑 Login' })).toBeVisible();
}

export async function logoutUser(page: Page) {
    await page.locator('summary').click();
    await page.getByRole('link', { name: '🚪 Logout' }).click();
    await expect(page).toHaveURL('/');
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
