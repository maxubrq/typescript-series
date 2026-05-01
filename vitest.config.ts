import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Run tests in Node.js environment
    environment: 'node',

    // No globals — use explicit imports: import { describe, it, expect } from 'vitest'
    globals: false,

    // Test file patterns
    include: ['src/**/*.{test,spec}.{ts,mts}'],
    exclude: ['node_modules', 'dist'],

    // Coverage via V8 (native, zero instrumentation overhead)
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'json-summary', 'html', 'lcov'],
      reportsDirectory: './coverage',
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.{test,spec}.ts',
        'src/**/__tests__/**',
        'src/**/index.ts', // re-export barrels don't need coverage
      ],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },

    // Show test file + test name on failure
    reporters: ['verbose'],

    // Faster test reruns: only re-run changed test files
    watch: false,
  },
});
