# Phase 3: Lead Qualification + Handoff - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-17
**Phase:** 03-lead-qualification-handoff
**Areas discussed:** [HANDOFF] text behavior, Urgency keyword detection, Pause state file structure, Handoff notification message

---

## [HANDOFF] text behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Send AI text + notification separately | Bot sends AI's message (with disclaimer), then sends handoff notification as a second message. Lead gets context + closure. | ✓ |
| Discard AI text, send notification only | Ignore whatever the AI wrote, only send the handoff notification. | |
| Combine into one message | Strip [HANDOFF], append notification to AI reply, send as single message with disclaimer. | |

**User's choice:** Send AI text + notification separately
**Notes:** Most natural for WhatsApp — two distinct messages, AI context preserved.

---

## Urgency keyword detection

| Option | Description | Selected |
|--------|-------------|----------|
| Verificação pré-IA | Check message BEFORE calling OpenAI. Keyword match → handoff direct, no tokens spent. | ✓ |
| Só via marcador [HANDOFF] da IA | No code-level detection. AI detects urgency via system prompt. | |
| Duas camadas: pré-IA + IA | Keyword check pre-IA as fast guard, AND AI can also signal via [HANDOFF]. | |

**User's choice:** Verificação pré-IA
**Follow-up — keyword list:** Env var `URGENCY_KEYWORDS` (configurable, comma-separated). Consistent with OPENAI_FALLBACK_MESSAGE pattern.

---

## Pause state file structure

| Option | Description | Selected |
|--------|-------------|----------|
| Metadados mínimos | JSON: { [contactId]: { pausedAt: number, reason: 'handoff' \| 'urgency' } } | ✓ |
| Lista simples de contactIds | Serialized array of contactIds only. | |

**File path:**

| Option | Description | Selected |
|--------|-------------|----------|
| data/paused.json | `./data/` dir at project root, gitignored. Path via `PAUSED_STATE_FILE` env var. | ✓ |
| Mesma pasta da aplicação (./) | File at project root. Simpler but mixes code and runtime data. | |

**User's choice:** Metadados mínimos + `data/paused.json`

---

## Handoff notification message

| Option | Description | Selected |
|--------|-------------|----------|
| Env var HANDOFF_MESSAGE | Configurable via .env. Default: "Um de nossos advogados irá dar continuidade ao seu atendimento em breve. Obrigado pela paciência." | ✓ |
| Hardcoded em português | Fixed text in code. Requires code change to adjust. | |

**User's choice:** Env var HANDOFF_MESSAGE

---

## Claude's Discretion

- Nome exato do service (`handoffService.ts` vs inline em `webhookHandler.ts`)
- Implementação exata do write atômico do arquivo JSON
- Campos adicionais de log para eventos de handoff
- Tratamento de erro ao falhar leitura do arquivo na startup

## Deferred Ideas

- HAND-06 (v2): Resumo estruturado da qualificação enviado ao advogado no handoff
- SESS-01 (v2): Endpoint admin para reativar bot para contactId pausado
- Notificação ao advogado quando handoff é disparado
