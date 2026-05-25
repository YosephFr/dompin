import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { crx } from '@crxjs/vite-plugin';
import { copyFileSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import manifest from './manifest.json' with { type: 'json' };

const ROOT = __dirname;
const DEMO_SRC = path.resolve(ROOT, '../../examples/demo-app');
const DEMO_DEST = path.resolve(ROOT, 'dist/examples/demo-app');

function copyDemoApp(): Plugin {
  return {
    name: 'dompin-copy-demo',
    apply: 'build',
    closeBundle() {
      try {
        statSync(DEMO_SRC);
      } catch {
        return;
      }
      mkdirSync(DEMO_DEST, { recursive: true });
      for (const file of readdirSync(DEMO_SRC)) {
        const src = path.join(DEMO_SRC, file);
        if (!statSync(src).isFile()) continue;
        copyFileSync(src, path.join(DEMO_DEST, file));
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), crx({ manifest }), copyDemoApp()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  build: {
    sourcemap: true,
    target: 'esnext',
    rollupOptions: {
      // Extra extension pages that aren't referenced from the manifest: the
      // offscreen recorder document and the one-time mic permission window.
      // CRXJS keeps HTML entry points at their source-relative path in dist.
      input: {
        offscreen: path.resolve(ROOT, 'src/offscreen/offscreen.html'),
        mic: path.resolve(ROOT, 'src/offscreen/mic.html'),
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      port: 5174,
    },
  },
});
