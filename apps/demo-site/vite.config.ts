import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  build: {
    outDir: 'dist',
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        operator: resolve(__dirname, 'operator.html'),
      },
    },
  },
  preview: {
    port: 5180,
    strictPort: true,
  },
});
