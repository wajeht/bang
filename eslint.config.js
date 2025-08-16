const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const security = require('eslint-plugin-security');
const prettier = require('eslint-plugin-prettier');
const prettierConfig = require('eslint-config-prettier');

module.exports = tseslint.config(
    {
        ignores: [
            'public/**/*',
            'src/views/components/**/*',
            'src/views/layouts/**/*',
            'src/views/pages/**/*',
            'dist/**/*',
            'node_modules/**/*',
            'playwright-report/**/*',
            '**/db.sqlite*',
            '**/*.test.ts',
            '**/*.test.mts',
            'src/db/bang.ts',
            'src/tests/**/*',
            'scripts/**/*',
            'eslint.config.js',
        ],
    },
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        plugins: {
            security,
            prettier,
        },
        languageOptions: {
            ecmaVersion: 'latest',
            sourceType: 'module',
            parserOptions: {
                tsconfigRootDir: __dirname,
                project: './tsconfig.json',
            },
            globals: {
                console: 'readonly',
                process: 'readonly',
                Buffer: 'readonly',
                __dirname: 'readonly',
                __filename: 'readonly',
                exports: 'writable',
                module: 'writable',
                require: 'readonly',
                global: 'readonly',
                setTimeout: 'readonly',
                clearTimeout: 'readonly',
                setInterval: 'readonly',
                clearInterval: 'readonly',
                setImmediate: 'readonly',
                clearImmediate: 'readonly',
            },
        },
        rules: {
            ...security.configs['recommended-legacy'].rules,
            '@typescript-eslint/ban-ts-comment': 'off',
            '@typescript-eslint/no-explicit-any': 'warn',
            '@typescript-eslint/no-unused-vars': [
                'warn',
                {
                    argsIgnorePattern: '^_',
                    varsIgnorePattern: '^_',
                    caughtErrorsIgnorePattern: '^_',
                },
            ],
        },
    },
    prettierConfig,
);
