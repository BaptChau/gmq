import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  plugins: [vue()],
  // Deux applications : l'appli exploitant (index.html) et le back-office (admin.html,
  // servi sur le sous-domaine backof.* par nginx ; en dev : http://localhost:5173/admin.html)
  build: {
    rollupOptions: {
      input: {
        main: fileURLToPath(new URL('./index.html', import.meta.url)),
        admin: fileURLToPath(new URL('./admin.html', import.meta.url)),
      },
    },
  },
  server: {
    port: 5173,
    // Proxy des appels /api vers le backend Express
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
