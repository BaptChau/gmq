import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    // Proxy des appels /api vers le backend Express
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
