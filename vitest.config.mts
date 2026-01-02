/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        clearMocks: true,
        globals: true,
        setupFiles: ['./src/tests/test-setup.ts'],
        server: {
            deps: {
                inline: [/node-cron/],
            },
        },
        exclude: [
            'node_modules',
            './opencode',
            './src/tests/browser',
            '**/*.browser-test.ts',
            './dist',
            './public',
            './test-results',
            './scripts',
            './playwright.config.ts',
        ],
        coverage: {
            exclude: [
                'node_modules/**',
                'src/tests/**',
                'src/db/migrations/**',
                'src/db/seeds/**',
                'src/db/sqlite/**',
                'dist/**',
                'public/**',
                'test-results/**',
                'playwright-report/**',
                'scripts/**',
                '*.config.*',
                '**/*.d.ts',
                'src/db/knexfile.ts',
                'src/type.ts',
            ],
            include: ['src/**/*.ts', 'src/**/*.mts'],
            reporter: ['text', 'html', 'json'],
            reportsDirectory: './coverage',
        },
    },
});
