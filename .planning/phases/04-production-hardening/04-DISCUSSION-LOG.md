# Phase 4: Production Hardening - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — este log preserva as alternativas consideradas.

**Date:** 2026-04-17
**Phase:** 04-production-hardening
**Areas discussed:** Deploy no Railway, Testes Adversariais, Texto de Compliance, Estratégia de Go-live

---

## Deploy no Railway

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Manter tsx | tsx direto, sem build step, ~200ms overhead aceitável | ✓ |
| Compilar para JS (tsc) | tsc + node dist/server.js, sem overhead runtime | |

**User's choice:** Manter tsx (Recomendado)

---

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Adicionar /health | GET /health retorna 200 + JSON, Railway health check | ✓ |
| Não adicionar | Railway detecta porta automaticamente | |

**User's choice:** Adicionar /health (Recomendado)

---

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Volume persistente Railway | Montar volume em /data, PAUSED_STATE_FILE=/data/paused.json | ✓ |
| Aceitar reset a cada deploy | paused.json ephemero, advogado reativa manualmente | |

**User's choice:** Volume persistente Railway (Recomendado)

---

## Testes Adversariais

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Markdown no repo | docs/ADVERSARIAL-TESTS.md, tabela PASS/FAIL, versionado | ✓ |
| Vitest automatizado | Suite com mock OpenAI API | |
| Log manual externo | Planilha externa, sem rastro no código | |

**User's choice:** Markdown no repo (Recomendado)

---

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| 3 casos realistas | Cenários de leads reais do Meta ADS | ✓ |
| 5-6 casos (mais amplo) | Inclui pressão emocional e jailbreak técnico | |

**User's choice:** 3 casos realistas (Recomendado)

**Notes:** Usuário clarificou que o público é majoritariamente leads do Meta ADS — pessoas reais respondendo a anúncios, não atacantes técnicos. Isso direcionou os 3 casos para perguntas naturais de quem está em apuros jurídicos.

---

## Texto de Compliance

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Fase 4 entrega os textos finais | Plano inclui redigir textos compliance-ready, escritório aprova antes do go-live | ✓ |
| Você mesmo aprova os textos | Review sem terceiros, go-live mais rápido | |

**User's choice:** Fase 4 entrega os textos finais

---

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Formal mas acessível | Linguagem que lead do Meta ADS entende | ✓ |
| Jurídico formal | Linguagem técnica com referências ao Provimento OAB 205/2021 | |

**User's choice:** Formal mas acessível (Recomendado)

---

## Estratégia de Go-live

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Sim, sandbox primeiro | SANDBOX_MODE=true + SANDBOX_NUMBERS, testar antes de abrir | ✓ |
| Deploy direto em produção | Sem sandbox, go-live imediato após testes locais | |

**User's choice:** Sim, sandbox primeiro (Recomendado)

---

| Opção | Descrição | Selecionado |
|-------|-----------|-------------|
| Checklist no CONTEXT.md | Gates explícitos de go-live além dos success criteria | ✓ |
| Success criteria do roadmap são suficientes | Sem checklist adicional | |

**User's choice:** Checklist no CONTEXT.md (Recomendado)

---

## Claude's Discretion

- Estrutura exata do railway.json (se necessário além do nixpacks automático)
- Campos adicionais no response do /health além de status e uptime
- Formato exato da tabela em ADVERSARIAL-TESTS.md
- Implementação do guard de sandbox no webhookHandler (posição na chain)

## Deferred Ideas

- SESS-01 (v2): Endpoint admin para reativar contactId pausado
- MON-01 (v2): /health com métricas detalhadas
- HAND-06 (v2): Resumo estruturado de qualificação no handoff
- Notificação ao advogado via Digisac quando handoff dispara
