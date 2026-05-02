// @ts-check
import prettier from 'eslint-config-prettier';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  // ── Ignored paths ──────────────────────────────────────────────────────────
  {
    ignores: ['dist/**', 'coverage/**', 'node_modules/**'],
  },

  // ── TypeScript strict + stylistic (type-aware) ────────────────────────────
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,

  // ── Parser options: point at tsconfig for type-aware rules ────────────────
  {
    languageOptions: {
      parserOptions: {
        // Explicitly find the nearest tsconfig for each linted file.
        // More reliable than projectService:true in IDE extensions that
        // initialize before the project service warms up (causing types
        // to fall back to an unresolved `any` context).
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      // Prefer `const` assertions and readonly where applicable
      '@typescript-eslint/prefer-readonly': 'error',
      // Enforce explicit return types on public API functions
      '@typescript-eslint/explicit-module-boundary-types': 'warn',
      // Disallow floating promises — always await or void
      '@typescript-eslint/no-floating-promises': 'error',
      // Require explicit handling of promise results
      '@typescript-eslint/no-misused-promises': 'error',
      // Ban console in production code (use a proper logger)
      'no-console': 'warn',
      '@typescript-eslint/consistent-type-definitions': 'off',
      '@typescript-eslint/require-await': 'warn',
    },
  },

  // ── Disable all formatting rules — Prettier handles them ──────────────────
  prettier,
);
