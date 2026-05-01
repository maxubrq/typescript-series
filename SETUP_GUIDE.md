# Production-Grade Node.js TypeScript Setup Guide

A complete walkthrough of every config decision in this repo: **who** should care, **what** it does, **when** it runs, **where** it lives, **why** it exists, and **how** it works.

---

## Table of Contents

1. [Prerequisites](#1-prerequisites)
2. [Project Structure](#2-project-structure)
3. [TypeScript — `tsconfig.json`](#3-typescript--tsconfigjson)
4. [tsup — Bundling](#4-tsup--bundling)
5. [Prettier — Code Formatting](#5-prettier--code-formatting)
6. [ESLint — Static Analysis](#6-eslint--static-analysis)
7. [Vitest — Testing](#7-vitest--testing)
8. [Package Scripts Reference](#8-package-scripts-reference)
9. [Development Workflow](#9-development-workflow)
10. [CI/CD Integration](#10-cicd-integration)

---

## 1. Prerequisites

| Tool       | Minimum Version | Why                                                              |
| ---------- | --------------- | ---------------------------------------------------------------- |
| Node.js    | 22 LTS          | ES2022 target runs natively; v22 ships `--watch` built in        |
| pnpm       | 10+             | Faster installs, strict `node_modules`, workspace support        |
| TypeScript | 6+              | `module: Preserve` + `moduleResolution: Bundler` require TS 5.4+ |

Install all dev dependencies in one shot:

```bash
pnpm install
```

---

## 2. Project Structure

```
.
├── src/
│   ├── index.ts           # Library entry point (exported public API)
│   └── index.test.ts      # Co-located unit tests
├── dist/                  # Compiled output — git-ignored (tsup writes here)
├── coverage/              # Test coverage reports — git-ignored
├── tsconfig.json          # TypeScript config (IDE + typecheck; tsup reads it for dts)
├── tsup.config.ts         # Bundler config — owns all emit decisions
├── eslint.config.js       # ESLint flat config (v9+)
├── .prettierrc            # Prettier formatting rules
├── .prettierignore        # Paths Prettier skips
└── vitest.config.ts       # Test runner config
```

**Why co-locate tests?** Tests live next to the source they cover (`foo.ts` / `foo.test.ts`). This makes refactoring safer — moving a file moves its tests automatically — and signals that tests are first-class citizens, not an afterthought.

**Why no `tsconfig.build.json`?** Previously needed to exclude test files from `tsc` emit. With tsup owning the build, that concern moves to `tsup.config.ts`. A single `tsconfig.json` is enough.

---

## 3. TypeScript — `tsconfig.json`

This is the most important configuration file in any TypeScript project. Every option below was chosen deliberately.

> **Role in this setup**: `tsconfig.json` is used for two things — IDE type-checking (auto-complete, inline errors) and `tsc --noEmit` (the `typecheck` script). **It does not emit JavaScript** — that job belongs to tsup.

---

### 3.1 Target & Module System

```jsonc
"target": "ES2022",
"module": "Preserve",
"moduleResolution": "Bundler",
"lib": ["ES2022"],
```

#### `target: "ES2022"`

- **What**: The JavaScript version TypeScript compiles _down to_ when emitting.
- **Why ES2022**: Node.js 22 natively supports ES2022 (`class fields`, `Error.cause`, `Array.at`, top-level `await`). Setting the target too low forces TypeScript to polyfill features Node already understands — wasted bytes and slower code.
- **When it matters**: Every `.ts` file you write. TypeScript won't emit syntax below this level.
- **How**: TypeScript transforms your code. `async/await` stays as-is (ES2017+), `class fields` stay as-is (ES2022), no downleveling happens.

#### `module: "Preserve"` ← the key change from `NodeNext`

- **What**: Tells TypeScript to leave your `import`/`export` syntax exactly as you wrote it — no transformation at all.
- **Why not `NodeNext`**: `NodeNext` was designed for running TypeScript output _directly_ with Node.js, which requires explicit `.js` extensions on every relative import (`import { foo } from './foo.js'`). With a bundler like tsup/esbuild, the bundler resolves files — Node never sees the bare imports. Forcing `.js` extensions is unnecessary friction.
- **Why `Preserve`**: It is the correct choice when a bundler owns emit. TypeScript's job in this setup is only to type-check; it doesn't need to emit valid Node-runnable code. `Preserve` makes no assumptions about the runtime.
- **When it matters**: You can now write `import { foo } from './foo'` without extensions. The bundler resolves it.
- **Who introduced it**: `module: Preserve` was added in TypeScript 5.4 specifically for bundler workflows.

#### `moduleResolution: "Bundler"`

- **What**: The algorithm TypeScript uses to find the file behind each `import` path.
- **Why `Bundler`**: Bundler resolution allows:
  - Extensionless imports (`./foo` instead of `./foo.js`)
  - `exports` field in `package.json` (subpath exports, conditional exports)
  - `imports` field in `package.json` (package self-referencing)
  - It mirrors how esbuild/Vite/webpack actually resolve files
- **Why not `Node10`/`Node16`/`NodeNext`**: Those algorithms expect you to write file extensions. `Bundler` matches what esbuild actually does.
- **Must pair with `module: Preserve`**: These two always go together in bundler workflows. Mixing them (e.g., `module: ESNext` + `moduleResolution: Bundler`) also works — `Preserve` is the stricter, more intentional choice.

#### `lib: ["ES2022"]`

- **What**: The type definitions TypeScript includes (think: the "standard library").
- **Why no `DOM`**: This is a Node.js project. Including DOM types would let you accidentally use `document.getElementById` — code that compiles fine but crashes at runtime. Omitting `DOM` turns those into compile errors.

---

### 3.2 Emit Options

```jsonc
"outDir": "./dist",
"rootDir": "./src",
"declaration": true,
"declarationMap": true,
"sourceMap": true,
"removeComments": false,
```

These options are still present for IDE tooling and tsup's `dts` step (which invokes the TypeScript compiler API to emit `.d.ts` files). The actual `.js` emit is handled by tsup, which ignores `outDir`/`rootDir` and uses its own config.

| Option           | What                               | Why                                                                                                                           |
| ---------------- | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `outDir`         | Where compiled `.js` files go      | Keeps source and build artifacts separate; `dist/` is git-ignored                                                             |
| `rootDir`        | The root of your TypeScript source | Prevents TypeScript from "spreading" output directories when files sit at different depths; enforces `src/` discipline        |
| `declaration`    | Emit `.d.ts` type definition files | Required for library consumers to get full type information; tsup reads this flag                                             |
| `declarationMap` | Emit `.d.ts.map` files             | Maps `.d.ts` back to `.ts` source; "Go to Definition" in IDEs jumps to the original TypeScript, not the generated declaration |
| `sourceMap`      | Emit `.js.map` files               | Maps `.js` back to `.ts`; stack traces in production (with a source map loader) show TypeScript line numbers                  |
| `removeComments` | Keep comments in `.js` output      | Set `false` so JSDoc comments survive in the compiled output for documentation tools                                          |

---

### 3.3 Module Interop

```jsonc
"esModuleInterop": true,
"resolveJsonModule": true,
"isolatedModules": true,
```

#### `esModuleInterop: true`

- **What**: Adds synthetic `default` imports for CommonJS modules that don't export a default.
- **Why**: Without it, `import fs from 'fs'` fails because Node's `fs` module uses `module.exports`, not `export default`. With `esModuleInterop`, TypeScript emits the correct interop wrapper.
- **Who cares**: Anyone using older CJS packages (most of npm).

#### `resolveJsonModule: true`

- **What**: Allows `import config from './config.json'` with full typing.
- **Why**: Type-safe JSON imports, zero manual type definitions.

#### `isolatedModules: true`

- **What**: Makes TypeScript error on constructs that can't be safely compiled file-by-file (e.g., `export type { Foo }` written as plain `export { Foo }`).
- **Why**: tsup uses esbuild under the hood, which compiles each file independently without full program analysis. If your code relies on cross-file type information for emit, esbuild silently produces broken output. `isolatedModules` catches these cases at typecheck time.

---

### 3.4 Type Safety — Strict Mode and Beyond

This is where production-grade diverges from "it just works."

```jsonc
"strict": true,
"noUncheckedIndexedAccess": true,
"noImplicitReturns": true,
"noFallthroughCasesInSwitch": true,
"exactOptionalPropertyTypes": true,
"noPropertyAccessFromIndexSignature": true,
```

#### `strict: true`

- **What**: An umbrella that enables eight sub-flags at once:
  - `strictNullChecks` — `null`/`undefined` are not assignable to other types
  - `strictFunctionTypes` — function parameter types are checked contravariantly
  - `strictBindCallApply` — `.bind()`, `.call()`, `.apply()` are type-checked
  - `strictPropertyInitialization` — class properties must be initialized
  - `noImplicitAny` — variables can't silently become `any`
  - `noImplicitThis` — `this` in functions must be typed
  - `alwaysStrict` — emits `"use strict"` and enforces strict mode semantics
  - `useUnknownInCatchVariables` — catch clause variables are `unknown`, not `any`
- **Why**: These catch an entire category of runtime bugs at compile time. Teams that skip `strict` ship null pointer exceptions, incorrect function signatures, and untyped catch handlers.

#### `noUncheckedIndexedAccess: true`

- **What**: Index signatures (`obj[key]`, `arr[i]`) return `T | undefined`, not `T`.
- **Why**: `arr[0]` can be `undefined` if the array is empty. Without this flag, TypeScript lets you treat it as always-defined, leading to silent `undefined` runtime errors. This is arguably the most impactful flag not included in `strict`.
- **Example**:
  ```typescript
  const names: string[] = [];
  const first = names[0]; // type: string | undefined (not string!)
  first.toUpperCase(); // Error: 'first' is possibly 'undefined'
  ```

#### `noImplicitReturns: true`

- **What**: Every code path in a function that returns a value must have an explicit `return`.
- **Why**: A function that falls off the end returns `undefined`. If callers expect a value, this is a silent bug.

#### `noFallthroughCasesInSwitch: true`

- **What**: `switch` cases without `break`/`return`/`throw` are an error.
- **Why**: Unintentional fallthrough is a classic C-style bug that TypeScript can catch statically.

#### `exactOptionalPropertyTypes: true`

- **What**: `{ prop?: string }` means the property is either absent _or_ a `string`. You cannot explicitly set it to `undefined`.
- **Why**: Without this, `obj.prop = undefined` passes even when the type says `string | undefined`. This distinction matters for APIs and serialization where "missing key" ≠ "key set to undefined".
- **Note**: This flag often requires small adjustments when integrating with libraries that set optional fields to `undefined`. The extra safety is worth it.

#### `noPropertyAccessFromIndexSignature: true`

- **What**: Forces dot-notation access (`obj.key`) to be statically known; bracket notation (`obj['key']`) is required for index-signature properties.
- **Why**: Makes it visually obvious in code when you're accessing a "known" property vs. a dynamic one.

---

### 3.5 Code Quality

```jsonc
"forceConsistentCasingInFileNames": true,
"noUnusedLocals": true,
"noUnusedParameters": true,
```

| Option                             | Why                                                                                                                                                                     |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `forceConsistentCasingInFileNames` | Prevents `import './Foo'` and `import './foo'` from referring to the same file on macOS (case-insensitive FS) but breaking on Linux CI (case-sensitive FS). Ships bugs. |
| `noUnusedLocals`                   | Dead code is a maintenance liability and a sign of incomplete refactors.                                                                                                |
| `noUnusedParameters`               | Same — unused function params usually mean the function signature needs updating. Prefix with `_` to explicitly mark intentionally unused: `_event`.                    |

---

### 3.6 Performance & Correctness

```jsonc
"skipLibCheck": true,
"incremental": true,
"tsBuildInfoFile": ".tsbuildinfo",
"ignoreDeprecations": "6.0",
```

#### `skipLibCheck: true`

- **What**: Skips type-checking `.d.ts` files in `node_modules`.
- **Why**: `node_modules` type definitions are not your code. Checking them adds significant time to typecheck and frequently produces errors you can't fix. The flag is safe because your own types are still fully checked; you're only skipping third-party declarations.

#### `incremental: true`

- **What**: TypeScript saves a build state cache (`.tsbuildinfo`) and only re-checks changed files on subsequent runs.
- **Why**: In large codebases this reduces `tsc --noEmit` time from minutes to seconds. Has no effect on correctness.

#### `ignoreDeprecations: "6.0"`

- **What**: Silences TypeScript 6 deprecation warnings for options that still work but will be removed in TypeScript 7.
- **Why it's here**: tsup v8 internally sets `baseUrl` when invoking the TypeScript compiler API for `.d.ts` generation. TypeScript 6 deprecated `baseUrl` and emits a warning that fails the build. This flag suppresses it until tsup ships a fix. Remove this once the underlying tsup version no longer triggers it.

---

## 4. tsup — Bundling

### Who

Any developer building the project for distribution (`pnpm build`). This section does not affect tests or local dev — only the `dist/` output.

### What

[tsup](https://tsup.egoist.dev) is a zero-config bundler for TypeScript libraries built on top of [esbuild](https://esbuild.github.io). It handles JavaScript emit, declaration file generation, source maps, and dual CJS/ESM output.

### Why tsup instead of plain `tsc`

| Concern               | Plain `tsc`                           | tsup                                  |
| --------------------- | ------------------------------------- | ------------------------------------- |
| Build speed           | Slow (full TS program analysis)       | Fast (esbuild, Rust-speed)            |
| Dual CJS + ESM output | Manual (two tsconfig files + scripts) | One `format: ['esm', 'cjs']` line     |
| Import extensions     | Required (`.js`) with `NodeNext`      | Not required (`Bundler` resolution)   |
| Tree-shaking          | None                                  | Built-in via esbuild                  |
| Type checking         | Yes (blocks on type errors)           | No (separate `tsc --noEmit` for that) |

**The division of labour**: tsup produces fast, optimized JavaScript. `tsc --noEmit` provides type safety. They run independently and each does its job well.

### Dual CJS + ESM output — Why?

```
dist/
  index.js      ← ESM  (consumers using import, Vite, esbuild, etc.)
  index.cjs     ← CJS  (consumers using require(), older tools)
  index.d.ts    ← TypeScript types for ESM
  index.d.cts   ← TypeScript types for CJS
```

Publishing both formats means your library works everywhere — in Node.js apps that use `require()`, in modern bundlers using `import`, and in ESM-first runtimes. The `exports` field in `package.json` tells the runtime which file to use:

```jsonc
"exports": {
  ".": {
    "import": { "types": "./dist/index.d.ts",  "default": "./dist/index.js"  },
    "require": { "types": "./dist/index.d.cts", "default": "./dist/index.cjs" }
  }
}
```

Node.js, bundlers, and TypeScript all read the `exports` field to pick the right file. `"types"` inside each condition tells TypeScript which `.d.ts` file corresponds to that format.

### Config — `tsup.config.ts`

```ts
export default defineConfig({
  entry: ['src/index.ts'], // One entry point → one output file per format
  format: ['esm', 'cjs'], // Emit both .js (ESM) and .cjs (CommonJS)
  dts: true, // Emit .d.ts + .d.cts via TypeScript compiler API
  sourcemap: true, // Inline source maps for debuggable stack traces
  clean: true, // Wipe dist/ before every build — no stale artifacts
  splitting: false, // No code-splitting; single file per format for a library
  treeshake: true, // Remove dead code paths via esbuild
  target: 'es2022', // Mirror tsconfig target — no unnecessary downleveling
});
```

#### `dts: true`

- **What**: tsup invokes the TypeScript compiler API to generate `.d.ts` declaration files — separate from the esbuild compilation step.
- **Why not skip it**: Without `.d.ts` files, consumers of your library lose all type information. They'd see `any` everywhere.
- **How it reads tsconfig**: tsup picks up `tsconfig.json` automatically. The `declaration`, `declarationMap`, and `rootDir` options there guide this step.

#### `clean: true`

- **What**: Deletes `dist/` before each build.
- **Why**: Prevents ghost artifacts. If you rename or delete a source file, the old compiled output would otherwise linger in `dist/` and potentially ship in a release.

#### `splitting: false`

- **What**: Disables esbuild's code-splitting (dynamic `import()` chunks).
- **Why**: For a library, consumers do their own bundling. Shipping pre-split chunks into a library's `dist/` adds complexity for no gain. Keep it simple: one file per format.

### How to run

```bash
pnpm build          # Build once — produces dist/
```

---

## 5. Prettier — Code Formatting

### Who

Every developer and every CI pipeline. Prettier is the _only_ tool that touches formatting — ESLint is configured to defer all formatting decisions to Prettier (via `eslint-config-prettier`).

### What

Prettier is an opinionated code formatter. It parses and reprints code with a consistent style, eliminating all formatting debates.

### Why Prettier instead of ESLint formatting rules

ESLint's formatting rules have poor error messages and are slow. Prettier's algorithm produces more consistent results and integrates with every editor. Running both causes conflicts. The solution: ESLint for logic/style rules, Prettier for formatting — never overlap.

### Config — `.prettierrc`

```jsonc
{
  "semi": true, // Always emit semicolons — avoids ASI pitfalls
  "singleQuote": true, // 'strings' not "strings" — less visual noise
  "trailingComma": "all", // Trailing commas everywhere valid in ES5+
  // Reduces line-diff noise when adding items
  "printWidth": 100, // Soft wrap at 100 chars (wider = fewer wraps for TS generics)
  "tabWidth": 2, // 2 spaces — standard for JS/TS ecosystem
  "endOfLine": "lf", // Unix line endings — consistent across macOS/Linux/Windows
  "arrowParens": "always", // (x) => x not x => x — consistent with TS type annotations
  "bracketSpacing": true, // { key: value } not {key: value}
  "bracketSameLine": false, // JSX closing > on its own line
  "quoteProps": "as-needed", // Only quote object keys when required
}
```

### How to run

```bash
pnpm format          # Format all files in-place
pnpm format:check    # CI: exit 1 if any file is not formatted
```

### `.prettierignore`

Ignore `pnpm-lock.yaml` (machine-generated) and `dist/` (compiled output). Never format generated files.

---

## 6. ESLint — Static Analysis

### What

ESLint v9 with the new **flat config** system (`eslint.config.js`) and the `typescript-eslint` plugin for type-aware rules.

### Why type-aware rules

Basic ESLint rules only look at the AST (syntax). Type-aware rules from `typescript-eslint` can ask "what is the _type_ of this expression?" — catching bugs that syntax analysis alone misses.

Example: `@typescript-eslint/no-floating-promises` requires that every `Promise` is either `await`ed or explicitly `.catch()`'d — impossible to enforce without type information.

### Config — `eslint.config.js`

```js
// Flat config (ESLint v9+) — one array of config objects, evaluated in order
export default tseslint.config(
  { ignores: ['dist/**', 'coverage/**', 'node_modules/**'] },

  // strictTypeChecked: all recommended rules + stricter additions + type-aware rules
  tseslint.configs.strictTypeChecked,
  // stylisticTypeChecked: consistent code style enforced by types
  tseslint.configs.stylisticTypeChecked,

  {
    languageOptions: {
      parserOptions: {
        // Find the nearest tsconfig.json for each linted file.
        // More reliable than projectService:true in IDE extensions.
        project: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /* custom overrides */
    },
  },

  // Must be last: disables all ESLint rules that Prettier handles
  prettier,
);
```

#### `project: true` vs `projectService: true`

typescript-eslint offers two modes for type-aware linting:

| Option                 | How it works                                                                                                           | Tradeoff                                                                                                                                                                                                                                     |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `project: true`        | Walks up the directory tree from each linted file and loads the nearest `tsconfig.json` into a full TypeScript program | Reliable in all contexts; slightly higher memory when many tsconfigs exist                                                                                                                                                                   |
| `projectService: true` | Uses TypeScript's Language Service API; shares state across files for faster incremental analysis                      | Faster, but IDE extensions may run lint before the service fully initializes — files fall into a "default project" with no custom `moduleResolution`, causing imports to resolve as `any` and triggering `@typescript-eslint/no-unsafe-call` |

**Why `project: true` is the safer default here**: with `moduleResolution: "Bundler"` and extensionless imports (`./index` not `./index.js`), the resolution algorithm in `tsconfig.json` must be applied correctly for every lint run. `project: true` guarantees this by eagerly loading the tsconfig; `projectService: true` defers it, which can fail transiently in editors.

#### Rule highlights

| Rule                                                | Why                                                                                                 |
| --------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `@typescript-eslint/no-floating-promises`           | Unhandled promises silently swallow errors. This is the #1 async bug.                               |
| `@typescript-eslint/no-misused-promises`            | Catches `if (asyncFn)` and event handler errors where a Promise is used as a boolean.               |
| `@typescript-eslint/prefer-readonly`                | Immutable-by-default reduces accidental mutation bugs.                                              |
| `@typescript-eslint/explicit-module-boundary-types` | Public API functions should have explicit return types — prevents accidental `any` leaking.         |
| `no-console`                                        | Use a structured logger in production; `console.log` is acceptable in scripts but not library code. |

### How to run

```bash
pnpm lint         # Check for violations
pnpm lint:fix     # Auto-fix safe violations
```

---

## 7. Vitest — Testing

### Who

Developers writing unit/integration tests, and CI pipelines.

### What

[Vitest](https://vitest.dev) is a Vite-native test runner with a Jest-compatible API. It understands TypeScript natively — no `ts-jest` or `babel-jest` transforms needed.

### Why Vitest over Jest

|            | Vitest                       | Jest                              |
| ---------- | ---------------------------- | --------------------------------- |
| TypeScript | Native                       | Requires `ts-jest` or `@swc/jest` |
| ESM        | First-class                  | Experimental, complex config      |
| Speed      | Fast (Vite-based transform)  | Slower with TS transform          |
| API        | Jest-compatible              | Established                       |
| Watch mode | Instant (module graph aware) | Full re-run by default            |

### Config — `vitest.config.ts`

```ts
export default defineConfig({
  test: {
    environment: 'node', // No jsdom — this is a Node.js project
    globals: false, // Explicit imports: import { describe, it } from 'vitest'
    include: ['src/**/*.{test,spec}.{ts,mts}'],
    coverage: {
      provider: 'v8', // V8's built-in coverage — zero instrumentation overhead
      thresholds: {
        // CI fails below these percentages
        lines: 80,
        functions: 80,
        branches: 80,
        statements: 80,
      },
    },
  },
});
```

#### Why `globals: false`

With explicit imports you get:

1. **Discoverability** — `import { describe } from 'vitest'` makes it clear where the API comes from.
2. **Type safety** — No need for `/// <reference types="vitest/globals" />` magic.
3. **Refactoring** — IDEs can trace and rename symbols accurately.

#### Why V8 coverage

V8 coverage uses the JavaScript engine's built-in instrumentation. It's accurate, zero-overhead (no code transformation), and works correctly with native ESM.

#### Test file convention

```
src/
  math.ts
  math.test.ts    ← co-located, same directory
```

### How to run

```bash
pnpm test               # Single run (CI mode)
pnpm test:watch         # Watch mode (dev)
pnpm test:coverage      # Run with coverage report
pnpm test:ui            # Browser-based UI (pnpm test:ui, then open localhost)
```

---

## 8. Package Scripts Reference

```jsonc
{
  "build": "tsup", // Bundle src/ → dist/ (esm + cjs + dts)
  "typecheck": "tsc --noEmit", // Type-check without emitting
  "lint": "eslint src", // Check for lint violations
  "lint:fix": "eslint src --fix", // Auto-fix lint violations
  "format": "prettier --write .", // Format all files in-place
  "format:check": "prettier --check .", // Check formatting (CI)
  "test": "vitest run", // Run tests once (CI)
  "test:watch": "vitest", // Interactive watch mode
  "test:coverage": "vitest run --coverage", // Tests + coverage report
  "test:ui": "vitest --ui", // Browser test UI
}
```

**Key distinction — `build` vs `typecheck`**: `tsup` (build) never fails on type errors — esbuild strips types without checking them. `tsc --noEmit` (typecheck) catches type errors without producing files. Run both in CI.

---

## 9. Development Workflow

### Daily development loop

```bash
pnpm test:watch     # Terminal 1: tests re-run on every save
pnpm typecheck      # Terminal 2: run manually, or use IDE (saves show errors inline)
```

### Before every commit

```bash
pnpm format         # Format first
pnpm lint:fix       # Fix auto-fixable lint issues
pnpm typecheck      # Ensure no type errors
pnpm test           # Ensure all tests pass
```

### Enforcing this automatically (recommended)

Install [simple-git-hooks](https://github.com/toplevel-dev/simple-git-hooks) for zero-dependency git hooks:

```bash
pnpm add -D simple-git-hooks lint-staged
```

Add to `package.json`:

```json
{
  "simple-git-hooks": {
    "pre-commit": "pnpm lint-staged"
  },
  "lint-staged": {
    "*.{ts,mts}": ["eslint --fix", "prettier --write"],
    "*.{json,md,yaml,yml}": "prettier --write"
  }
}
```

Run once to install the hook:

```bash
pnpx simple-git-hooks
```

Now `git commit` automatically formats and lints staged files.

---

## 10. CI/CD Integration

A minimal GitHub Actions workflow that validates every pull request:

```yaml
# .github/workflows/ci.yml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4
        with:
          version: 10

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - run: pnpm format:check # Fail if code is not formatted
      - run: pnpm lint # Fail on lint violations
      - run: pnpm typecheck # Fail on type errors
      - run: pnpm test:coverage # Fail if coverage drops below thresholds
      - run: pnpm build # Fail if tsup bundling breaks
```

**Why this order?**

1. `format:check` — fastest, fails immediately on trivial issues
2. `lint` — catches logic/style issues
3. `typecheck` — full type-system validation (can be slow on large codebases)
4. `test:coverage` — validates behavior and enforces coverage thresholds
5. `build` — tsup bundling as final gate; verifies the entry points produce valid output

**Important**: `build` and `typecheck` are independent checks. A `tsup` build can succeed with type errors (esbuild strips types). Always run both.

---

## Summary

| Layer           | Tool                       | Config file        | Responsibility                         |
| --------------- | -------------------------- | ------------------ | -------------------------------------- |
| Language        | TypeScript                 | `tsconfig.json`    | Type safety, IDE support, dts for tsup |
| Bundling        | tsup (esbuild)             | `tsup.config.ts`   | JS emit, dual CJS/ESM, tree-shaking    |
| Formatting      | Prettier                   | `.prettierrc`      | Consistent code style                  |
| Static analysis | ESLint + typescript-eslint | `eslint.config.js` | Logic errors, type-aware rules         |
| Testing         | Vitest                     | `vitest.config.ts` | Unit tests, coverage                   |

The tools are complementary and non-overlapping:

- **Prettier** handles _how code looks_
- **ESLint** handles _how code behaves_
- **TypeScript** handles _what types are_
- **tsup** handles _what ships to consumers_
- **Vitest** handles _what the code does at runtime_
