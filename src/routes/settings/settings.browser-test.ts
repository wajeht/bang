import { test, expect, loginUser } from '../../tests/browser-test-fixtures';

test.describe('Settings', () => {
    test.beforeEach(async ({ page }) => {
        await loginUser(page, 'settings-test@example.com');
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
});
