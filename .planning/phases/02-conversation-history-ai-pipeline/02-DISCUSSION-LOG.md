# Phase 2: Conversation History + AI Pipeline - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 02-conversation-history-ai-pipeline
**Areas discussed:** Mutex design, Lead Qualification, 429 Fallback, Session TTL

---

## Mutex design

| Option | Description | Selected |
|--------|-------------|----------|
| async-mutex | Adicionar o pacote `async-mutex` (~2KB, sem deps). Simples e explícito: Mutex por contactId no Map. Testado especificamente para esse padrão em Node.js. | ✓ |
| Promise-queue manual | Implementar uma fila de Promises por contactId sem pacote extra. Mais código, mas mantém zero dependências novas. | |
| Você decide | Não é prioridade discutir — deixar o implementador escolher. | |

**Ciclo de vida dos mutexes:**

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy: remover após liberar | Após acquire/release, verificar se mutex está idle e remover do Map. Sem setInterval. | ✓ |
| Junto com TTL do histórico | Remover o mutex quando o histórico do contactId expirar (24h). | |
| Não gerenciar | Para volume pequeno/médio, vazamento é irrelevante. | |

**User's choice:** async-mutex + lazy removal após release
**Notes:** Consistência com o padrão lazy eviction da Fase 1 (D-09).

---

## Lead Qualification

| Option | Description | Selected |
|--------|-------------|----------|
| Só system prompt | O system prompt instrui a IA a coletar campos naturalmente. Sem código de extração na Fase 2. | ✓ |
| System prompt + marcadores de código | IA sinaliza campos com marcadores ([NOME: João]) que o código detecta. | |
| System prompt + extração separada | Segunda chamada OpenAI para extrair JSON estruturado após cada resposta. Dobra custo de tokens. | |

**Áreas jurídicas no system prompt:**

| Option | Description | Selected |
|--------|-------------|----------|
| Placeholder genérico | Usar áreas típicas (trabalhista, família, cível, criminal). Escritório ajusta via .env antes do deploy. | ✓ |
| Definir áreas agora | Informar as áreas reais do escritório. | |

**User's choice:** System prompt only + placeholder genérico
**Notes:** Handoff estruturado (Fase 3) pode adicionar extração depois se necessário.

---

## 429 Fallback

| Option | Description | Selected |
|--------|-------------|----------|
| Log estruturado + mensagem ao lead | Logar com pino (warn) incluindo contactId e timestamp. Admin verifica logs do Railway. | ✓ |
| Armazenar contactId pendente em memória | Lista de contactIds afetados em memória. Perde dados ao reiniciar. | |
| Armazenar em arquivo de follow-up | Append em arquivo JSON persistente. Sobrevive a restart. | |

**Mensagem de fallback:**

| Option | Description | Selected |
|--------|-------------|----------|
| Env var OPENAI_FALLBACK_MESSAGE | Consistente com abordagem de compliance (D-02 da Fase 1). | ✓ |
| Hardcoded com fallback default | Texto padrão no código, sem env var extra. | |

**User's choice:** Log estruturado + mensagem via env var OPENAI_FALLBACK_MESSAGE
**Notes:** Sem estado extra em código — follow-up via logs do Railway.

---

## Session TTL

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy: checar na próxima mensagem | Ao receber mensagem, verificar se último acesso > 24h. Resetar se sim. Consistente com D-09. | ✓ |
| setInterval de limpeza | Roda a cada hora e remove históricos inativos. Garante limpeza sem mensagens novas. | |

**Expiração do consentimento LGPD:**

| Option | Description | Selected |
|--------|-------------|----------|
| Sim, tudo expira junto | Resetar histórico + consentGiven ao expirar TTL. Lead recebe disclosure novamente. | ✓ |
| Consentimento persiste independente | Somente histórico expira. Consentimento mantido indefinidamente. | |

**User's choice:** Lazy check + expiração total (histórico + consentimento)
**Notes:** Comportamento previsível; lead recorrente após 24h recebe fluxo completo novamente.

---

## Claude's Discretion

- Estrutura interna do Map de sessão (objeto unificado vs. Maps separados)
- Implementação exata do lock/unlock do async-mutex (try/finally)
- Campo de timestamp para TTL (ISO string vs. epoch ms)
- Formato do log warn para 429

## Deferred Ideas

- Texto final do SYSTEM_PROMPT aprovado pelo escritório (revisão stakeholder antes do deploy)
- Extração estruturada de dados de qualificação — movida para Fase 3 se necessário
