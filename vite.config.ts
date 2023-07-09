import { defineConfig } from 'vite';

import Components from 'unplugin-vue-components/vite';
import Icons from 'unplugin-icons/vite';
import IconsResolver from 'unplugin-icons/resolver';

import vue from '@vitejs/plugin-vue';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const rollupOptions = {};

if (process.env.NODE_ENV === 'dev' || process.env.NODE_ENV === 'development') {
	rollupOptions.output = {
		entryFileNames: 'assets/[name].js',
		chunkFileNames: 'assets/[name].js',
		assetFileNames: 'assets/[name][extname]',
	};
}

export default defineConfig({
	plugins: [
		vue(),
		Components({
			dts: true,
      globalNamespaces: ['global'],
      directoryAsNamespace: true,
			dirs: ['./components'],
			resolvers: [
				IconsResolver({
					componentPrefix: 'i',
				}),
			],
		}),
		Icons({
      compiler: 'vue3',
    }),
	],
	root: './src/views/',
	define: {
		'process.env': process.env,
	},
	server: {
		host: '0.0.0.0',
		port: process.env.VUE_PORT as unknown as number,
		proxy: {
			'/api': {
				target: `http://localhost:${process.env.SERVER_PORT}`,
				changeOrigin: true,
				rewrite: (path) => path.replace(/^\/api/, '/api'),
			},
		},
	},
	build: {
		outDir: '../../public',
		reportCompressedSize: true,
		chunkSizeWarningLimit: 1600,
		emptyOutDir: false,
		sourcemap: true,
		rollupOptions,
	},
});
