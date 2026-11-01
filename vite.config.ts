import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
const deployment = JSON.parse(readFileSync(new URL('./deployment.json', import.meta.url), 'utf8'))

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
  // The Marketplace integration uses Next.js names. Expose only these two
  // browser-safe values; database passwords and service keys stay server-only.
  return {
    plugins: [react(), tailwindcss()],
    server: { proxy: { '/api': { target: deployment.vercel.productionUrl, changeOrigin: true } } },
    preview: { proxy: { '/api': { target: deployment.vercel.productionUrl, changeOrigin: true } } },
    resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL || env.SUPABASE_URL || ''),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(env.VITE_SUPABASE_PUBLISHABLE_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY || ''),
    },
  }
})
