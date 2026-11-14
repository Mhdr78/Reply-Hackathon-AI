/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig(({ mode }) => {
  // CHATBOT_SERVER is read by the dev server only (no VITE_ prefix, so it never reaches the browser).
  const env = loadEnv(mode, process.cwd(), '');
  const chatbotServer = env.CHATBOT_SERVER || 'http://127.0.0.1:8787';

  return {
    plugins: [react(), tailwindcss()],
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    test: { environment: 'node', include: ['src/**/*.test.ts'] },
    server: {
      host: '127.0.0.1', port: 5173, strictPort: true,
      proxy: {
        '/media': { target: chatbotServer, changeOrigin: true },
        // Browser → /chatbot-api/api/... → the chatbot server (services/chatbot). Keeps the OpenRouter key on the server and avoids CORS.
        '/chatbot-api': { target: chatbotServer, changeOrigin: true, rewrite: (p) => p.replace(/^\/chatbot-api/, '') },
      },
    },
  };
});
