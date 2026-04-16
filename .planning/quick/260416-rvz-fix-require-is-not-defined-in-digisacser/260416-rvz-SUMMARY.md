---
phase: quick-260416-rvz
plan: "01"
subsystem: digisac-service
tags: [esm, cjs-interop, require, createRequire, digisac-sdk]
dependency_graph:
  requires: []
  provides: [esm-safe-sdk-loading]
  affects: [src/services/digisacService.ts]
tech_stack:
  added: [createRequire from 'module' (Node built-in)]
  patterns: [createRequire(import.meta.url) for CJS interop in ESM context]
key_files:
  modified:
    - src/services/digisacService.ts
decisions:
  - "createRequire(import.meta.url) used instead of bare require() — valid ESM, same CJS resolution, no new dependency"
metrics:
  duration: "5m"
  completed: "2026-04-16"
  tasks: 1
  files: 1
---

# Quick Task 260416-rvz: Fix require is not defined in digisacService Summary

**One-liner:** Replaced bare `require()` shims with `createRequire(import.meta.url)` from Node's built-in `module` package — ESM-legal CJS interop that eliminates the startup `ReferenceError`.

## Tasks Completed

| Task | Name | Commit | Files |
|------|------|--------|-------|
| 1 | Replace bare require() with createRequire | 8dc4dda | src/services/digisacService.ts |

## What Was Done

The project runs in `"type": "module"` + `module: NodeNext` mode. Bare `require()` is not defined in ESM and threw `ReferenceError: require is not defined` at server startup when `digisacService.ts` was imported.

`createRequire` from Node's built-in `module` package is the standard ESM escape hatch: it returns a `require`-compatible function scoped to a given file URL, resolves to the same CJS bundle as the old shim, and is fully valid ESM. No new dependencies introduced.

Changes made to `src/services/digisacService.ts`:
- Added `import { createRequire } from 'module';`
- Added `const _require = createRequire(import.meta.url);`
- Replaced both `require('@ikatec/digisac-api-sdk')` and `require('@ikatec/digisac-api-sdk/apis')` calls with `_require(...)` equivalents
- Updated ESLint disable comment from `no-require-imports` to `no-unsafe-assignment` (correct rule for cast expression)
- Updated file-level JSDoc comment to reflect new loading mechanism

## Verification

- `npx tsc --noEmit` exits 0 with zero output
- No bare `require(` pattern in `digisacService.ts`
- `sendMessage(contactId: string, text: string): Promise<void>` signature unchanged
- `complianceService.ts` untouched (confirmed no changes needed)

## Deviations from Plan

None — plan executed exactly as written.

## Self-Check: PASSED

- src/services/digisacService.ts — FOUND (modified)
- Commit 8dc4dda — FOUND in git log
- tsc --noEmit — exits 0
- No bare require() — confirmed by grep
