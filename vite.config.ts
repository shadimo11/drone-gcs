import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron/simple';
import renderer from 'vite-plugin-electron-renderer';

// Native / Node modules that must NOT be bundled into the Electron main
// process. Bundling serialport into an ES-module main.js is what caused the
// "__dirname is not defined" crash — its bindings loader relies on __dirname
// being available in CommonJS context. Keeping it external loads it normally
// from node_modules at runtime.
const externals = [
  'serialport',
  '@serialport/bindings-cpp',
  '@serialport/stream',
  '@serialport/parser-readline',
];

export default defineConfig({
  plugins: [
    react(),
    electron({
      main: {
        entry: 'electron/main.ts',
        vite: {
          build: {
            rollupOptions: { external: externals },
          },
        },
      },
      preload: {
        input: 'electron/preload.cts', // <--- Change to .cts
        vite: {
          build: {
            rollupOptions: { external: externals },
          },
        },
      },
      renderer: {},
    }),
    renderer(),
  ],
  build: {
    outDir: 'dist',
  },
  server: {
    port: 5173,
  },
});
