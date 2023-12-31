import { defineConfig } from 'vite';
import { RollupOptions } from 'rollup';

import Components from 'unplugin-vue-components/vite';
import Icons from 'unplugin-icons/vite';
import IconsResolver from 'unplugin-icons/resolver';

import vue from '@vitejs/plugin-vue';
import path from 'path';
import dotenv from 'dotenv';

dotenv.config({ path: path.join(process.cwd(), '.env') });

const rollupOptions: RollupOptions = {};

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
			dts: './components.d.ts',
			globalNamespaces: ['global'],
			exclude: [/[\\/]node_modules[\\/]/, /[\\/]\.git[\\/]/, /[\\/]\.nuxt[\\/]/],
			dirs: ['./components', './layouts', './pages'],
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
		hmr: true,
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
	resolve: {
		alias: {
			'@/views': path.resolve(__dirname, './src/views'),
		},
	},
	build: {
		outDir: '../../public',
		reportCompressedSize: true,
		chunkSizeWarningLimit: 1600,
		emptyOutDir: false,
		sourcemap: true,
		target: 'esnext',
		rollupOptions,
	},
});
