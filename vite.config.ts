import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/client',
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:30018',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src/client'),
    },
  },
});
