import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs in `wrangler pages dev` on port 8788 (see `npm run dev`).
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8788' } },
});
