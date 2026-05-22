import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import tailwindcss from "@tailwindcss/vite"
import path from "path"

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
  ],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },

  server: {
    port: 1420,
    strictPort: true,
    watch: {
      ignored: ['**/sidecar/**'],
    },
    // Pre-transform the hot path so the browser gets instant responses on first load.
    // Vite 5.1+ feature — eliminates the "waterfall of 404s while Vite warms up" delay.
    warmup: {
      clientFiles: [
        './src/main.tsx',
        './src/App.tsx',
        './src/App.css',
        './src/components/layout/AppShell.tsx',
        './src/components/layout/Sidebar.tsx',
        './src/components/layout/PageTransition.tsx',
        './src/components/chat/MessageThread.tsx',
        './src/components/chat/ChatInput.tsx',
        './src/store/chatStore.ts',
        './src/store/profileStore.ts',
        './src/hooks/useSidecarHealth.ts',
      ],
    },
  },

  optimizeDeps: {
    // Force esbuild to pre-bundle these packages before the browser even loads.
    // Without this, Vite discovers them mid-load → triggers a dep re-optimisation
    // → forces a full page reload → the whole module waterfall starts over.
    include: [
      'react',
      'react/jsx-runtime',
      'react-dom',
      'react-dom/client',
      'framer-motion',
      'lucide-react',
      'zustand',
      'zustand/middleware',
      'sonner',
      'date-fns',
      'react-markdown',
      'remark-gfm',
      'react-syntax-highlighter',
      'react-syntax-highlighter/dist/esm/styles/prism',
      'pdfjs-dist',
      'ogl',
      'nspell',
      '@radix-ui/react-context-menu',
      '@tauri-apps/api/path',
      '@tauri-apps/api/event',
      '@tauri-apps/plugin-fs',
      '@tauri-apps/plugin-dialog',
      '@tauri-apps/plugin-opener',
      '@tauri-apps/plugin-store',
    ],
  },
})