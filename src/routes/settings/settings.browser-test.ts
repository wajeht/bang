import { test, expect, loginUser } from '../../tests/browser-test-fixtures.js';

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

    test('keeps account settings readable on mobile', async ({ page }) => {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.goto('/settings/account');

        await expect(page.getByRole('heading', { name: '👤 Account' })).toBeVisible();
        await expect(
            page.locator('main > div:has(nav[aria-label="Settings navigation"]) fieldset').first(),
        ).toBeVisible();

        const settingsLayout = page.locator(
            'main > div:has(nav[aria-label="Settings navigation"])',
        );
        const columnCount = await settingsLayout.evaluate((element) => {
            return getComputedStyle(element).gridTemplateColumns.split(' ').length;
        });
        expect(columnCount).toBe(1);

        const cardWidth = await page
            .locator('main > div:has(nav[aria-label="Settings navigation"]) fieldset')
            .first()
            .evaluate((element) => {
                return Math.ceil(element.getBoundingClientRect().width);
            });
        const viewportWidth = await page.evaluate(() => document.documentElement.clientWidth);
        expect(cardWidth).toBeLessThanOrEqual(viewportWidth);

        const horizontalOverflow = await page.evaluate(
            () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
        );
        expect(horizontalOverflow).toBeLessThanOrEqual(1);
    });
});
