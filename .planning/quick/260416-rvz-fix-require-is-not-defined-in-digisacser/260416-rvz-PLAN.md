---
phase: quick-260416-rvz
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - src/services/digisacService.ts
autonomous: true
requirements:
  - fix-require-esm-compat
must_haves:
  truths:
    - "Server starts without 'require is not defined' error"
    - "sendMessage() calls Digisac API successfully at runtime"
    - "tsc --noEmit passes with zero errors"
  artifacts:
    - path: "src/services/digisacService.ts"
      provides: "ESM-compatible SDK loading via createRequire"
      contains: "createRequire"
  key_links:
    - from: "src/services/digisacService.ts"
      to: "@ikatec/digisac-api-sdk"
      via: "createRequire(import.meta.url)"
      pattern: "createRequire"
---

<objective>
Replace the bare `require()` shims in digisacService.ts with ESM-legal `createRequire` from Node's built-in `module` package.

Purpose: The project uses `"type": "module"` in package.json and `module: NodeNext` in tsconfig. Bare `require()` is not defined in ESM — it throws `ReferenceError: require is not defined` at startup. The SDK's `.d.ts` files use extensionless relative re-exports that NodeNext cannot type-resolve, so a regular `import { BaseApiClient }` fails tsc. `createRequire` from `'module'` is the standard ESM escape hatch: it is valid ESM, ships with Node 20+, passes tsc, and resolves to the SDK's CJS bundle at runtime.

complianceService.ts does NOT use require() — it only imports from digisacService.ts and project-local modules. No changes needed there.

Output: digisacService.ts free of bare require(), server starts cleanly, tsc --noEmit passes.
</objective>

<execution_context>
@$HOME/.claude/get-shit-done/workflows/execute-plan.md
@$HOME/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@.planning/STATE.md
</context>

<tasks>

<task type="auto">
  <name>Task 1: Replace bare require() with createRequire in digisacService.ts</name>
  <files>src/services/digisacService.ts</files>
  <action>
At the top of the file, REPLACE the two bare `require()` calls (lines 31–38) with `createRequire`.

Step 1 — Add import at the top of the file, directly after the existing imports from '../utils/env.js' and '../utils/logger.js':

```typescript
import { createRequire } from 'module';
```

Step 2 — Replace the two `// eslint-disable-next-line` + `const { ... } = require(...)` blocks with:

```typescript
const _require = createRequire(import.meta.url);

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const { BaseApiClient } = _require('@ikatec/digisac-api-sdk') as {
  BaseApiClient: new (url: string, token: string) => IBaseApiClient;
};

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const { MessagesApi } = _require('@ikatec/digisac-api-sdk/apis') as {
  MessagesApi: new (client: IBaseApiClient) => IMessagesApi;
};
```

Keep the existing interface declarations (CreateMessagePayload, IMessagesApi, IBaseApiClient) and all code below the instantiation block unchanged. The function signatures sendMessage(contactId, text) must remain identical.

DO NOT switch to direct `import { BaseApiClient }` named imports — tsc TS2305 errors confirmed (SDK dist/index.d.ts uses extensionless re-exports incompatible with NodeNext; skipLibCheck does not help here).
  </action>
  <verify>
    <automated>cd /home/rodrigo/botLP && npx tsc --noEmit 2>&1</automated>
  </verify>
  <done>
- src/services/digisacService.ts contains `createRequire` import from 'module'
- No bare `require(` calls remain in the file
- `npx tsc --noEmit` exits 0 with no errors
- `sendMessage` function signature unchanged: (contactId: string, text: string): Promise&lt;void&gt;
  </done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| Node runtime → SDK CJS bundle | createRequire loads CJS; same bundle the old require() was loading |

## STRIDE Threat Register

| Threat ID | Category | Component | Disposition | Mitigation Plan |
|-----------|----------|-----------|-------------|-----------------|
| T-rvz-01 | Tampering | createRequire path | accept | Module resolution is identical to the old require() shim; no new attack surface introduced. The CJS bundle path is resolved by Node from node_modules — same as before. |
</threat_model>

<verification>
1. Run `npx tsc --noEmit` — must exit 0 with no output
2. Run `node --import tsx/esm src/server.ts` (or `npm run dev`) — server must reach "listening on port" without `ReferenceError: require is not defined`
3. Confirm no bare `require(` pattern in digisacService.ts: `grep -n "= require(" src/services/digisacService.ts` must return no lines
4. Confirm complianceService.ts is untouched (no changes needed)
</verification>

<success_criteria>
- `npx tsc --noEmit` passes with zero errors
- Server starts without ReferenceError at the digisacService module load
- `sendMessage`, `runComplianceFlow`, and `appendDisclaimer` function signatures are unchanged
- No bare require() in either service file
</success_criteria>

<output>
After completion, create `.planning/quick/260416-rvz-fix-require-is-not-defined-in-digisacser/260416-rvz-SUMMARY.md`
</output>
