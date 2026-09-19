import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: {
    // The Obsidian npm package has declarations only; tests supply the required runtime API.
    alias: { obsidian: fileURLToPath(new URL('./tests/obsidian-stub.ts', import.meta.url)) },
  },
  test: { include: ['tests/**/*.test.ts'] },
});
