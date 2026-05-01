import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],

  // Emit both ESM (.js) and CommonJS (.cjs) — consumers choose what they need
  format: ['esm', 'cjs'],

  // Generate .d.ts + .d.cts declaration files via TypeScript compiler API
  dts: true,

  // Inline source maps into output files (easier debugging, no extra .map files to deploy)
  sourcemap: true,

  // Wipe dist/ before every build so stale artifacts never ship
  clean: true,

  // Keep one output file per entry — no code-splitting needed for a library
  splitting: false,

  // Remove dead code paths
  treeshake: true,

  // Mirror tsconfig target so esbuild doesn't downlevel unnecessarily
  target: 'es2022',
});
