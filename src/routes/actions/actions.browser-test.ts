import { test, expect, loginUser } from '../../tests/browser-test-fixtures';

test.describe('Actions', () => {
    test.beforeEach(async ({ page }) => {
        await loginUser(page, 'actions-test@example.com');
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

    test('can search and use actions', async ({ page, baseURL }) => {
        await page.goto('/actions/create');

        await page.getByLabel('⚡ Trigger').fill('testsearch');
        await page.getByLabel('📝 Name').fill('Test Search Action');
        await page.getByLabel('🌐 URL').fill(`${baseURL}/search/results?q={{{s}}}`);
        await page.getByLabel('🏷️ Action Type').selectOption('search');
        await page.getByRole('button', { name: '💾 Save' }).click();

        await expect(page).toHaveURL('/actions');
        await expect(page.locator('body')).toContainText('Action !testsearch created successfully');

        await page.goto('/');

        await page.getByRole('searchbox').fill('!testsearch hello world');
        await page.getByRole('searchbox').press('Enter');
        await expect(page).toHaveURL(`${baseURL}/search/results?q=hello%20world`);
    });
});
