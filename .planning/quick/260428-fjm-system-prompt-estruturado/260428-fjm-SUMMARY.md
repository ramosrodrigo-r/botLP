---
quick_id: 260428-fjm
slug: system-prompt-estruturado
description: Gerar um system prompt mais bem estruturado para o agente de IA
date: 2026-04-28
status: complete
---

# Summary

## O que foi feito

Reescreveu o `SYSTEM_PROMPT` no `.env.example` seguindo os 5 pilares solicitados.

## Mudanças

**`.env.example`** — `SYSTEM_PROMPT` substituído por versão estruturada em seções:

| Pilar | Seção no Prompt | O que mudou |
|-------|----------------|-------------|
| Representação (papel) | `## PAPEL` | Identidade explícita: triagem de leads via WhatsApp, não é advogado |
| Contexto | `## CONTEXTO OPERACIONAL` | Explica o fluxo completo: LGPD já aceita, marcador [HANDOFF] e transferência automática |
| Iteração | `## FLUXO DE QUALIFICAÇÃO` | Ordem explícita dos 4 campos + instrução de não repetir perguntas já respondidas |
| Formato | `## FORMATO DE RESPOSTA` | Máx. 3-4 linhas, sem markdown, tom empático, reconhecimento antes de avançar |
| Precisão (clareza) | `## RESTRIÇÕES ABSOLUTAS` + todo o prompt | Verbos imperativos, proibições enumeradas, script de redirecionamento para pressão jurídica |

**Adição chave**: instrução explícita sobre o marcador `[HANDOFF]` com exemplo de uso — o prompt anterior não mencionava o mecanismo de handoff, dependendo do modelo inferir quando transferir.

## Decisões

- Usado formato `dotenv` com string multiline entre aspas duplas (`SYSTEM_PROMPT="..."`) — compatível com a lib `dotenv` e mantém legibilidade no arquivo de exemplo.
- Seções com `##` usadas internamente (só o LLM lê, não o usuário final).
- Script de redirecionamento jurídico incluído como texto literal — elimina variação entre sessões.
