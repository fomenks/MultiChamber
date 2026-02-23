import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  base: '/mc13/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/mc13/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/mc13/chamber': {
        target: 'http://localhost:8080',
        changeOrigin: true,
        secure: false,
        cookieDomainRewrite: 'localhost',
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq, req) => {
            const token = localStorage.getItem('multichamber_token');
            if (token) {
              proxyReq.setHeader('Authorization', `Bearer ${token}`);
            }
            const cookie = localStorage.getItem('multichamber_token');
            if (cookie) {
              proxyReq.setHeader('Cookie', `token=${cookie}`);
            }
          });
        },
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
