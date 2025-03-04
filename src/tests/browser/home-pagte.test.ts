import { test, expect } from '@playwright/test';

test('can get / page', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveTitle(/Bang - DuckDuckGo's !Bangs, but on steroids./);
});

test('can login and redirect to GitHub', async ({ page }) => {
    await page.goto('/');

    await page.getByRole('button', { name: '🚀 Get Started' }).click();

    await expect(page.getByText('🔐 Join the Bang Gang!')).toBeVisible();

    const githubPromise = page.waitForURL('https://github.com/**');

    await page.getByRole('button', { name: '🐙 Bang with GitHub' }).click();

    await githubPromise;

    expect(page.url()).toContain('github.com');
});
