import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import { aiProxy } from './server/aiProxy.ts'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  // Load every variable from .env / .env.local (not just VITE_-prefixed ones) for
  // server-side use only. Nothing here is exposed to the browser bundle.
  const env = loadEnv(mode, process.cwd(), '')

  return {
    plugins: [
      react(),
      aiProxy({
        apiKey: env.GEMINI_API_KEY || undefined,
        model: env.GEMINI_MODEL || 'gemini-2.5-flash',
      }),
    ],
  }
})
