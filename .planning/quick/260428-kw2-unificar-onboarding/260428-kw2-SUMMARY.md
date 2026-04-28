---
quick_id: 260428-kw2
slug: unificar-onboarding
description: Unificar onboarding — remover LGPD_CONSENT_MESSAGE, adicionar ONBOARDING_MESSAGE
date: 2026-04-28
status: complete
---

# Summary

## O que foi feito

Removeu `LGPD_CONSENT_MESSAGE` (redundante) e substituiu por `ONBOARDING_MESSAGE` — uma mensagem enviada junto do disclosure que já inicia a qualificação pedindo nome e descrição do problema.

## Arquivos alterados

| Arquivo | Mudança |
|---------|---------|
| `src/utils/env.ts` | `LGPD_CONSENT_MESSAGE` → `ONBOARDING_MESSAGE` no schema Zod |
| `src/services/complianceService.ts` | `env.LGPD_CONSENT_MESSAGE` → `env.ONBOARDING_MESSAGE`; comentários atualizados |
| `.env.example` | Removida entrada `LGPD_CONSENT_MESSAGE`; adicionada `ONBOARDING_MESSAGE` com valor padrão |

## Novo fluxo de onboarding

**Antes (2 mensagens separadas com propósitos distintos):**
1. DISCLOSURE_MESSAGE — informa que é IA
2. LGPD_CONSENT_MESSAGE — pede consentimento LGPD, não inicia qualificação

**Depois (2 mensagens complementares):**
1. DISCLOSURE_MESSAGE — informa que é IA + que um advogado pode dar continuidade
2. ONBOARDING_MESSAGE — pede nome + descrição do problema (inicia a qualificação)

## Commit

`097b128`
