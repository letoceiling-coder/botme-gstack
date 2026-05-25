import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3010',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api/, ''),
      },
      '/admin': {
        target: 'http://localhost:3010',
        changeOrigin: true,
        ws: true,
        bypass(req) {
          // React route /admin — SPA; Socket.IO uses /socket.io/, not this path
          const isSocketIo =
            req.url?.includes('EIO=') ||
            req.url?.includes('transport=') ||
            req.headers.upgrade === 'websocket';
          if (!isSocketIo && req.method === 'GET') {
            return '/index.html';
          }
        },
      },
      '/socket.io': {
        target: 'http://localhost:3010',
        changeOrigin: true,
        ws: true,
      },
      '/widget': {
        target: 'http://localhost:3010',
        changeOrigin: true,
        ws: true,
      },
      '/operator-panel': {
        target: 'http://localhost:3010',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  preview: {
    host: '0.0.0.0',
    port: 4173,
    allowedHosts: ['agent.neeklo.ru', 'localhost', '127.0.0.1'],
  },
});
