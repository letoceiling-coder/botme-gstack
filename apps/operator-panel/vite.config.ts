import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const monorepoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  base: '/operator-panel/',
  plugins: [react()],
  resolve: {
    alias: {
      '@botme/rtc-runtime': resolve(monorepoRoot, 'packages/rtc-runtime/src/index.ts'),
    },
  },
  optimizeDeps: {
    exclude: ['@botme/rtc-runtime'],
  },
  server: {
    port: 5175,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:3010',
        changeOrigin: true,
        ws: true,
      },
    },
  },
  build: {
    commonjsOptions: {
      transformMixedEsModules: true,
    },
    rollupOptions: {
      input: {
        embed: 'index.html',
        loader: 'loader/loader.ts',
      },
      output: {
        entryFileNames: (chunk) =>
          chunk.name === 'loader' ? 'operator-panel.js' : 'assets/[name]-[hash].js',
      },
    },
  },
  preview: {
    port: 4175,
    strictPort: true,
    allowedHosts: ['agent.neeklo.ru', 'localhost'],
  },
});
