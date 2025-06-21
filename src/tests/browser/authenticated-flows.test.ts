import { test, expect } from '@playwright/test';
import { loginUser, cleanupTestData } from './test-utils';

test.describe('Authenticated User Flows', () => {
    test.afterEach(async () => {
        await cleanupTestData();
    });

    test.beforeEach(async ({ page }) => {
        await loginUser(page, 'test@example.com');
    });

    test('can create a new action', async ({ page }) => {
        await page.goto('/actions');

        await page.getByRole('button', { name: 'Create new action' }).click();

        await expect(page).toHaveURL('/actions/create');
        await expect(page.getByText('Actions / New')).toBeVisible();

        await page.getByLabel('⚡ Trigger').fill('testaction');
        await page.getByLabel('📝 Name').fill('Test Action');
        await page.getByLabel('🌐 URL').fill('https://example.com/search?q={{{s}}}');
        await page.getByLabel('🏷️ Action Type').selectOption('search');

        await page.getByRole('button', { name: '💾 Save' }).click();

        await expect(page).toHaveURL('/actions');
        await expect(page.locator('body')).toContainText('Action !testaction created successfully');

        await expect(page.locator('table')).toContainText('Test Action');
        await expect(page.locator('table')).toContainText('!testaction');
    });

    test('can create a new bookmark', async ({ page }) => {
        await page.goto('/bookmarks');

        await page.getByRole('button', { name: 'Create new bookmark' }).click();

        await expect(page).toHaveURL('/bookmarks/create');
        await expect(page.getByText('🔖 Bookmarks / New')).toBeVisible();

        await page.getByLabel('🌐 URL').fill('https://example.com');
        await page.getByLabel('📝 Name').fill('Test Bookmark');

        await page.getByRole('button', { name: '💾 Save' }).click();

        await expect(page).toHaveURL('/bookmarks');
        await expect(page.locator('body')).toContainText(
            'Bookmark Test Bookmark created successfully',
        );

        await expect(page.locator('table')).toContainText('Test Bookmark');
        await expect(page.locator('table')).toContainText('https://example.com');
    });

    test('can create a new note', async ({ page }) => {
        await page.goto('/notes');

        await page.getByRole('button', { name: 'Create new note' }).click();

        await expect(page).toHaveURL('/notes/create');
        await expect(page.getByText('📝 Notes / New')).toBeVisible();

        await page.getByLabel('📝 Title').fill('Test Note');
        await page.getByLabel('📄 Content').fill('This is a test note content with **markdown**.');

        await page.getByRole('button', { name: '💾 Save' }).click();

        await expect(page).toHaveURL('/notes');
        await expect(page.locator('body')).toContainText('Note created successfully');

        await expect(page.locator('body')).toContainText('Test Note');
    });

    test('can navigate through user menu', async ({ page }) => {
        await page.goto('/');

        await page.locator('summary').click();

        await expect(page.getByRole('link', { name: '📝 Notes' })).toBeVisible();
        await expect(page.getByRole('link', { name: '⚡ Actions' })).toBeVisible();
        await expect(page.getByRole('link', { name: '🔖 Bookmarks' })).toBeVisible();
        await expect(page.locator('a[href="/api-docs"]')).toBeVisible();
        await expect(page.locator('a[href="/settings"]')).toBeVisible();
        await expect(page.locator('a[href="/logout"]')).toBeVisible();

        await page.getByRole('link', { name: '⚡ Actions' }).click();
        await expect(page).toHaveURL('/actions');

        await page.locator('summary').click();
        await page.getByRole('link', { name: '🔖 Bookmarks' }).click();
        await expect(page).toHaveURL('/bookmarks');

        await page.locator('summary').click();
        await page.getByRole('link', { name: '📝 Notes' }).click();
        await expect(page).toHaveURL('/notes');

        await page.locator('summary').click();
        await page.locator('a[href="/settings"]').click();
        await expect(page).toHaveURL('/settings/account');
    });

    test('can access settings and update account', async ({ page }) => {
        await page.goto('/settings/account');

        await expect(page.getByRole('heading', { name: '👤 Account' })).toBeVisible();

        await expect(page.getByLabel('👤 Username')).toBeVisible();
        await expect(page.getByLabel('📧 Email')).toBeVisible();
        await expect(page.getByLabel('🔎 Default Search Provider')).toBeVisible();

        await page.getByLabel('👤 Username').fill('testuser_updated');

        await page.getByRole('button', { name: '💾 Save' }).click();

        await expect(page).toHaveURL('/settings/account');
        await expect(page.getByText('🔄 updated!')).toBeVisible();

        await page.goto('/actions');

        await expect(page.locator('summary')).toContainText('testuser_updated');
    });

    test('can search and use actions', async ({ page }) => {
        await page.goto('/actions/create');

        await page.getByLabel('⚡ Trigger').fill('testsearch');
        await page.getByLabel('📝 Name').fill('Test Search Action');
        await page.getByLabel('🌐 URL').fill('https://example.com/search?q={{{s}}}');
        await page.getByLabel('🏷️ Action Type').selectOption('search');
        await page.getByRole('button', { name: '💾 Save' }).click();

        await page.goto('/');

        await page.getByRole('searchbox').fill('!testsearch hello world');
        await page.getByRole('button', { name: 'Submit search' }).click();

        await expect(page).toHaveURL('https://example.com/search?q=hello%20world');
    });
});
