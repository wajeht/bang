import { test, expect, loginUser } from '../../tests/browser-test-fixtures.js';

test.describe('Notes', () => {
    test.beforeEach(async ({ page }) => {
        await loginUser(page, 'notes-test@example.com');
    });

    test('can create a new note', async ({ page }) => {
        await page.goto('/notes');

        await page.getByRole('button', { name: 'Create new note' }).click();

        await expect(page).toHaveURL('/notes/create');
        await expect(page.getByText('📝 Notes / New')).toBeVisible();

        await page.getByLabel('📝 Title').fill('Test Note');
        await page.getByLabel('📄 Content').fill('This is a test note content with **markdown**.');

        await page.getByRole('button', { name: '💾 Save' }).click();

        await expect(page).toHaveURL(/\/notes\/\d+/);
        await expect(page.locator('body')).toContainText('Note created successfully');
        await expect(page.locator('body')).toContainText('Test Note');
    });
});
