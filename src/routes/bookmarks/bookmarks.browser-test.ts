import { test, expect } from '@playwright/test';
import { loginUser, cleanupTestData } from '../../tests/browser/browser-test-utils';

test.describe('Bookmarks', () => {
    test.afterEach(async () => {
        await cleanupTestData();
    });

    test.beforeEach(async ({ page }) => {
        await loginUser(page, 'test@example.com');
    });

    test('can create a new bookmark', async ({ page }) => {
        await page.goto('/bookmarks');

        await page.getByRole('button', { name: 'Create new bookmark' }).click();

        await expect(page).toHaveURL('/bookmarks/create');
        await expect(page.getByText('⭐️ Bookmarks / New')).toBeVisible();

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
});
