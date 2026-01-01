import { config } from './src/config';
import { defineConfig, devices } from '@playwright/test';

/**
 * Read environment variables from file.
 * https://github.com/motdotla/dotenv
 */
// import dotenv from 'dotenv';
// dotenv.config({ path: path.resolve(__dirname, '.env'), quiet: true });

/**
 * See https://playwright.dev/docs/test-configuration.
 */
export default defineConfig({
    testDir: './src/routes',
    testMatch: '**/*.browser-test.ts',
    /* Global setup file to run database migrations */
    globalSetup: './src/tests/browser-test-setup.ts',
    /* Global teardown file to cleanup resources */
    globalTeardown: './src/tests/browser-test-teardown.ts',
    /* Run tests in files in parallel */
    fullyParallel: false,
    /* Fail the build on CI if you accidentally left test.only in the source code. */
    forbidOnly: !!process.env.CI,
    /* Retry on CI only */
    retries: process.env.CI ? 2 : 0,
    /* Keep sequential in CI to avoid database conflicts */
    workers: 1,
    /* Reporter to use. See https://playwright.dev/docs/test-reporters */
    reporter: process.env.CI ? 'list' : 'html',
    /* Shared settings for all the projects below. See https://playwright.dev/docs/api/class-testoptions. */
    use: {
        /* Base URL to use in actions like `await page.goto('/')`. */
        baseURL: `http://127.0.0.1:${config.app.port}`,

        /* Collect trace when retrying the failed test. See https://playwright.dev/docs/trace-viewer */
        trace: 'on-first-retry',
    },

    /* Configure projects for major browsers */
    projects: [
        {
            name: 'chromium',
            use: {
                ...devices['Desktop Chrome'],
                // Use system Chromium in Docker/Alpine environment
                ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH && {
                    launchOptions: {
                        executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
                        args: [
                            '--no-sandbox',
                            '--disable-setuid-sandbox',
                            '--disable-dev-shm-usage',
                            '--disable-accelerated-2d-canvas',
                            '--no-first-run',
                            '--no-zygote',
                            '--disable-gpu',
                        ],
                    },
                }),
            },
        },
    ],

    /* Run your local dev server before starting the tests */
    webServer: {
        command: process.env.CI ? 'npm run dev:only' : 'npm run dev',
        url: `http://127.0.0.1:${config.app.port}`,
        reuseExistingServer: !process.env.CI,
        timeout: process.env.CI ? 120_000 : 60_000,
    },
});
