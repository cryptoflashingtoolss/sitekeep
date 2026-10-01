import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';

// Tauri expects a fixed port and sets TAURI_DEV_HOST when running on a phone.
const host = process.env.TAURI_DEV_HOST;
const root = fileURLToPath(new URL('.', import.meta.url));

/** `--mode demo`: swap the real backend for in-memory sample data. */
function demoBackend(): Plugin {
  return {
    name: 'sitekeep-demo-backend',
    enforce: 'pre',
    resolveId(source, importer) {
      if (!importer || importer.includes('/src/demo/')) return null;
      for (const m of ['vault', 'ai', 'supabase']) {
        if (source.endsWith(`/lib/${m}`) || source === `./${m}`) {
          if (source === `./${m}` && !importer.includes('/src/lib/')) continue;
          return `${root}src/demo/${m}.ts`;
        }
      }
      return null;
    },
  };
}

export default defineConfig(({ mode }) => ({
  plugins: [react(), ...(mode === 'demo' ? [demoBackend(), viteSingleFile()] : [])],
  base: mode === 'demo' ? './' : '/',
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
    watch: { ignored: ['**/src-tauri/**'] },
  },
  envPrefix: ['VITE_', 'TAURI_ENV_'],
  build: {
    target: 'es2021',
    sourcemap: false,
    chunkSizeWarningLimit: 1600,
    assetsInlineLimit: mode === 'demo' ? 100_000_000 : 4096,
    outDir: mode === 'demo' ? 'dist-demo' : 'dist',
  },
  test: {
    environment: 'node',
  },
}) as any);
