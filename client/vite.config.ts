import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The backend has no CORS middleware, so the dev server proxies /v1 to it.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/v1': 'http://localhost:3000',
    },
  },
});
