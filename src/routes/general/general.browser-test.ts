import {
    loginUser,
    logoutUser,
    openLoginDialog,
    cleanupTestData,
    authenticateUser,
    expectUserLoggedIn,
    expectUserLoggedOut,
    submitEmailForMagicLink,
} from '../../tests/browser-test-utils';
import { test, expect } from '@playwright/test';

test.afterEach(async () => {
    await cleanupTestData();
});

test('can get / page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Bang - Search/);
});

test('can open login dialog', async ({ page }) => {
    await page.goto('/');
    await openLoginDialog(page);

    await expect(
        page.getByText("Enter your email address and we'll send you a magic link to log in."),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: '🚀 Send' })).toBeVisible();
});

test('can submit email for magic link', async ({ page }) => {
    await page.goto('/');
    await submitEmailForMagicLink(page, 'test@example.com');

    await expect(page.locator('body')).toContainText('Magic link sent to test@example.com');
});

test('can authenticate with magic link', async ({ page }) => {
    await authenticateUser(page, 'test@example.com');

    await expect(page).toHaveURL('/actions');
});

test('handles invalid magic link', async ({ page }) => {
    await page.goto('/auth/magic/invalid-token');

    await page.waitForURL('/', { timeout: 5000 });

    await expect(page.locator('body')).toContainText('Magic link has expired or is invalid');

    await expect(page.locator('body')).toContainText('expired or is invalid');
});

test('can logout user', async ({ page }) => {
    await loginUser(page, 'test@example.com');
    await expectUserLoggedIn(page);

    await logoutUser(page);
    await expectUserLoggedOut(page);

    await expect(page.locator('body')).toContainText('see ya!');
});

test('redirects authenticated users to actions page', async ({ page }) => {
    await loginUser(page, 'test@example.com');

    await page.goto('/');
    await expect(page).toHaveTitle(/Bang - Search/);
    await expect(page).toHaveURL('/');

    await expect(page.locator('summary')).toContainText('👤');
    await expect(page.getByRole('link', { name: '🔑 Login' })).not.toBeVisible();
});

test('can navigate through user menu', async ({ page }) => {
    await loginUser(page, 'test@example.com');
    await page.goto('/');

    await page.locator('summary').click();

    await expect(page.getByRole('link', { name: '📝 Notes' })).toBeVisible();
    await expect(page.getByRole('link', { name: '🚀 Actions' })).toBeVisible();
    await expect(page.getByRole('link', { name: '⭐️ Bookmarks' })).toBeVisible();
    await expect(page.locator('a[href="/api-docs"]')).toBeVisible();
    await expect(page.locator('a[href="/settings"]')).toBeVisible();
    await expect(page.locator('a[href="/logout"]')).toBeVisible();

    await page.getByRole('link', { name: '🚀 Actions' }).click();
    await expect(page).toHaveURL('/actions');

    await page.locator('summary').click();
    await page.getByRole('link', { name: '⭐️ Bookmarks' }).click();
    await expect(page).toHaveURL('/bookmarks');

    await page.locator('summary').click();
    await page.getByRole('link', { name: '📝 Notes' }).click();
    await expect(page).toHaveURL('/notes');

    await page.locator('summary').click();
    await page.locator('a[href="/settings"]').click();
    await expect(page).toHaveURL('/settings/account');
});
