import { Context } from '../context';
import { Page, expect } from '@playwright/test';
import { createDb, createUser, cleanupUserData } from './test-db';
import type { AppContext } from '../type';

const db = createDb();

let cachedContext: AppContext | null = null;
const getContext = async () => cachedContext ?? (cachedContext = await Context());

export async function ensureTestUserExists(email = 'test@example.com') {
    return createUser(db, email);
}

export async function authenticateUser(page: Page, email = 'test@example.com') {
    const user = await ensureTestUserExists(email);
    const ctx = await getContext();
    const token = ctx.utils.auth.generateMagicLink({ email });

    await page.goto(`/auth/magic/${token}`);
    await page.waitForURL('/actions', { timeout: 5000 });

    return user;
}

export async function openLoginDialog(page: Page) {
    await page.goto('/');
    await page.getByRole('link', { name: '🔑 Login' }).click();
    await expect(page.getByText('🚀 Send')).toBeVisible();
}

export async function submitEmailForMagicLink(page: Page, email = 'test@example.com') {
    await openLoginDialog(page);
    await page.getByLabel('📧 Email Address').fill(email);
    await page.getByRole('button', { name: '🚀 Send' }).click();
    await page.waitForURL('/', { timeout: 5000 }).catch(() => {});
}

export async function loginUser(page: Page, email = 'test@example.com') {
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
    await page.locator('a[href="/logout"]').click();
    await expect(page).toHaveURL('/');
}

export async function cleanupTestData() {
    await cleanupUserData(db);
}
