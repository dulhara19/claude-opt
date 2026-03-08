import { defineConfig } from 'tsup';

export default defineConfig([
  {
    entry: ['src/index.ts'],
    format: ['esm'],
    sourcemap: true,
    dts: true,
    clean: true,
    shims: true,
    banner: {
      js: '#!/usr/bin/env node',
    },
  },
  {
    entry: ['src/mcp/server.ts', 'src/hooks/user-prompt-submit.ts'],
    format: ['esm'],
    sourcemap: true,
    clean: false,
    shims: true,
  },
]);
