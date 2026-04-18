---
phase: 04-production-hardening
fixed_at: 2026-04-17T00:00:00Z
review_path: .planning/phases/04-production-hardening/04-REVIEW.md
iteration: 1
findings_in_scope: 3
fixed: 3
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-04-17
**Source review:** .planning/phases/04-production-hardening/04-REVIEW.md
**Iteration:** 1

**Summary:**
- Findings in scope: 3
- Fixed: 3
- Skipped: 0

## Fixed Issues

### WR-01: Guard 0 (sandbox) extrai `contactId` via cast independente do Guard após Guard 5

**Files modified:** `src/handlers/webhookHandler.ts`
**Commit:** fd8bbe5
**Applied fix:** Alterada a condição do Guard 0 de `!sandboxContactId || !sandboxNumbers.has(sandboxContactId)` para `sandboxContactId !== undefined && !sandboxNumbers.has(sandboxContactId)`. Payloads sem `contactId` (eventos de controle, health checks, etc.) agora passam pelo Guard 0 e chegam ao Guard 1, que os descarta corretamente como `non-message event`. Apenas payloads que têm `contactId` definido mas não estão na lista sandbox são bloqueados.

---

### WR-02: `SANDBOX_MODE` usa `z.coerce.boolean()` — interpreta string `"false"` como `true`

**Files modified:** `src/utils/env.ts`
**Commit:** cefc867
**Applied fix:** Substituído `z.coerce.boolean().default(false)` por `z.string().default('false').transform((val) => val.toLowerCase() === 'true')`. Agora apenas a string `"true"` (case-insensitive) ativa o sandbox — qualquer outro valor (`"false"`, `"0"`, string vazia, etc.) resulta em `false`, eliminando o risco de ativar inadvertidamente o sandbox em produção.

---

### WR-03: `railway.json` usa `npx tsx` como `startCommand` — potencial timeout de cold start

**Files modified:** `railway.json`
**Commit:** 0ff4366
**Applied fix:** Substituído `"npx tsx src/server.ts"` por `"node --import tsx/esm src/server.ts"`. Elimina a resolução de pacote via npx a cada restart/deploy, usando diretamente o runtime Node.js com o loader tsx/esm (disponível via devDependency instalada no `node_modules`). Reduz risco de timeout no cold start do Railway.

---

_Fixed: 2026-04-17_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
