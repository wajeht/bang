import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [vue()],
  server: {
    hmr: true,
    port: 300,
    proxy: {
      '/api': {
        target: 'http://localhost:80',
        changeOrigin: true,
        rewrite: (path: string) => path.replace(/^\/api/, '/api'),
      },
      '/favicon.ico': {
        target: 'http://localhost:80',
        changeOrigin: true,
        rewrite: (path: string) => path,
      },
    },
  },
  build: {
    outDir: '../dist',
  }
})
