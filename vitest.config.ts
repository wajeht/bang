import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		clearMocks: true,
		globals: true,
		setupFiles: ["./src/tests/vue-test-setup.ts"],
		exclude: ['node_modules'],
    environment: 'jsdom',
	},
});
