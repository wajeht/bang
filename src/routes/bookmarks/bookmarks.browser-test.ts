import { test, expect, loginUser } from '../../tests/browser-test-fixtures';

test.describe('Bookmarks', () => {
    test.beforeEach(async ({ page }) => {
        await loginUser(page, 'bookmarks-test@example.com');
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

    test('can create bookmark from reminder', async ({ page }) => {
        await page.goto('/reminders/create');

        await page.getByLabel('📝 Title').fill('Check GitHub Issue');
        await page.getByLabel('📝 Content').fill('https://github.com/example/repo/issues/123');
        await page.getByLabel('⏰ When').selectOption('custom');

        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowString = tomorrow.toISOString().split('T')[0];
        await page.getByLabel('📅 Custom Date').fill(tomorrowString!);

        await page.getByRole('button', { name: '💾 Save' }).click();

        await expect(page).toHaveURL('/reminders');
        await expect(page.locator('body')).toContainText('Reminder created successfully');

        const reminderRow = page.locator('table tbody tr').first();
        const actionsCell = reminderRow.locator('td').last();
        const bookmarkLink = actionsCell.locator('a[href*="/bookmarks/create"]');
        const bookmarkUrl = await bookmarkLink.getAttribute('href');
        await page.goto(bookmarkUrl!);

        await expect(page.getByText('⭐️ Create Bookmark from Reminder')).toBeVisible();

        await expect(page.getByLabel('📝 Name')).toHaveValue('Check GitHub Issue');
        await expect(page.getByLabel('🌐 URL')).toHaveValue(
            'https://github.com/example/repo/issues/123',
        );

        await page.getByRole('button', { name: '💾 Save Bookmark' }).click();

        await expect(page).toHaveURL('/reminders');
        await expect(page.locator('body')).toContainText(
            'Bookmark Check GitHub Issue created successfully!',
        );

        await page.goto('/bookmarks');
        await expect(page.locator('table')).toContainText('Check GitHub Issue');
        await expect(page.locator('table')).toContainText(
            'https://github.com/example/repo/issues/123',
        );

        await page.goto('/reminders');
        await expect(page.locator('table')).toContainText('Check GitHub Issue');
    });

    test('can create bookmark from reminder and delete reminder', async ({ page }) => {
        await page.goto('/reminders/create');

        await page.getByLabel('📝 Title').fill('Read Documentation');
        await page.getByLabel('📝 Content').fill('https://docs.example.com/getting-started');
        await page.getByLabel('⏰ When').selectOption('daily');

        await page.getByRole('button', { name: '💾 Save' }).click();

        await expect(page).toHaveURL('/reminders');
        await expect(page.locator('body')).toContainText('Reminder created successfully');

        const reminderRow = page.locator('table tbody tr').first();
        const actionsCell = reminderRow.locator('td').last();
        const bookmarkLink = actionsCell.locator('a[href*="/bookmarks/create"]');
        const bookmarkUrl = await bookmarkLink.getAttribute('href');
        await page.goto(bookmarkUrl!);

        await expect(page.getByText('⭐️ Create Bookmark from Reminder')).toBeVisible();

        await page.getByLabel('🗑️ Delete reminder after creating bookmark').check();

        await page.getByRole('button', { name: '💾 Save Bookmark' }).click();

        await expect(page).toHaveURL('/reminders');
        await expect(page.locator('body')).toContainText(
            'Bookmark Read Documentation created successfully and reminder deleted!',
        );

        await page.goto('/bookmarks');
        await expect(page.locator('table')).toContainText('Read Documentation');
        await expect(page.locator('table')).toContainText(
            'https://docs.example.com/getting-started',
        );

        await page.goto('/reminders');
        await expect(page.locator('body')).not.toContainText('Read Documentation');
    });
});
