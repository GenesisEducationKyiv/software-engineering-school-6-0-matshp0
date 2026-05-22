import { defineConfig, Plugin } from 'vitest/config';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

function resolveJsToTs(): Plugin {
  return {
    name: 'resolve-js-to-ts',
    enforce: 'pre',
    resolveId(id, importer) {
      if (
        !id.endsWith('.js') ||
        !importer ||
        importer.includes('node_modules')
      ) {
        return null;
      }
      const importerPath = importer.startsWith('file://')
        ? fileURLToPath(importer)
        : importer;
      const abs = resolve(dirname(importerPath), id.replace(/\.js$/, '.ts'));
      return existsSync(abs) ? abs : null;
    },
  };
}

const __dirname = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig({
  plugins: [resolveJsToTs()],
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@test': resolve(__dirname, 'test'),
    },
  },
  test: {
    fileParallelism: false,
    environment: 'node',
    include: ['test/**/*.integration.test.ts'],
    globalSetup: ['test/setup/global.setup.ts'],
    setupFiles: ['test/setup/env.setup.ts'],
    testTimeout: 30000,
    execArgv: ['--import', 'tsx/esm'],
  },
});
