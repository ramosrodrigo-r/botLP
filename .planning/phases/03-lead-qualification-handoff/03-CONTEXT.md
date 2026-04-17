# Phase 3: Lead Qualification + Handoff - Context

**Gathered:** 2026-04-17
**Status:** Ready for planning

<domain>
## Phase Boundary

Detecção de handoff e pausa do bot: quando a IA inclui `[HANDOFF]` na resposta (ou quando uma palavra-chave de urgência é detectada antes de chamar a IA), o bot envia a mensagem da IA + notificação de handoff, pausa o bot para aquele contactId, e persiste o estado de pausa em arquivo (sobrevive a restarts). Mensagens subsequentes de contactIds pausados são descartadas sem chamar a Claude API.

Requisitos cobertos: HAND-01, HAND-02, HAND-03, HAND-04, HAND-05.

</domain>

<decisions>
## Implementation Decisions

### Comportamento do texto [HANDOFF] (HAND-01, HAND-02, HAND-03)

- **D-01:** Quando a IA retorna texto que contém `[HANDOFF]`: enviar o texto da IA (com disclaimer appendado) como **primeira mensagem**, depois enviar a notificação de handoff como **segunda mensagem separada**. O marcador `[HANDOFF]` é removido do texto antes de enviar. O lead recebe contexto da IA + fechamento da notificação.
- **D-02:** Detecção do marcador: checar se `aiReply` contém a string literal `[HANDOFF]`. Strip via `replace('[HANDOFF]', '').trim()`. Detecção em `webhookHandler.ts` após receber o retorno de `getAIResponse()` — ponto natural no pipeline já existente.
- **D-03:** Após handoff disparado: pausar o contactId, NÃO adicionar a resposta ao histórico da sessão (a conversa encerrou para a IA), e registrar log `info` com `contactId` e `reason: 'marker'`.

### Detecção de Urgência Pré-IA (Success Criterion 4)

- **D-04:** Checar a mensagem do lead por palavras-chave de urgência **antes** de chamar a OpenAI. Se detectado: disparar handoff direto, enviar apenas a notificação `HANDOFF_MESSAGE`, sem gastar tokens. Não há texto da IA nesse fluxo — só a notificação.
- **D-05:** Lista de palavras-chave configurável via env var **`URGENCY_KEYWORDS`** (lista separada por vírgula). Default sugerido: `preso,liminar,audiência amanhã,habeas corpus,flagrante`. Case-insensitive, match parcial (`includes`). Consistente com o padrão de configuração via env var já estabelecido.
- **D-06:** Guard de urgência entra em `webhookHandler.ts` imediatamente após os guards existentes (dedup, isFromMe, etc.) e **antes** do compliance flow. Mensagem de urgência pausa e notifica sem passar pela onboarding de LGPD.

### Estado de Pausa Persistido (HAND-04, HAND-05)

- **D-07:** Estrutura do arquivo: JSON com objeto `{ [contactId]: { pausedAt: number, reason: "marker" | "urgency" } }`. Inclui metadados mínimos (quando e por que pausou) — útil para debug e logs sem complexidade extra. **Nota terminológica:** "marker" nomeia o mecanismo (o marcador `[HANDOFF]` emitido pela IA) e "urgency" nomeia o gatilho pré-IA por palavra-chave. Revisto em 2026-04-17 para alinhamento literal com o `PauseRecord` definido em `handoffService.ts` (anteriormente "handoff" | "urgency"; "marker" é mais preciso e evita ambiguidade com a categoria geral "handoff").
- **D-08:** Path do arquivo: **`./data/paused.json`** — diretório `data/` na raiz do projeto, listado no `.gitignore`. Path configurável via env var **`PAUSED_STATE_FILE`** com default `./data/paused.json`. Consistente com deploy no Railway (volume persistente ou mesmo ephemeral storage).
- **D-09:** Carregar o arquivo na inicialização do servidor (`server.ts` ou `handoffService.ts`). Gravar atomicamente após cada mudança (write + rename, ou write direto com try/catch). Sem debounce — handoffs são raros.
- **D-10:** Em memória: `Map<string, { pausedAt: number; reason: string }>` como cache. Arquivo é a fonte da verdade para restarts. Ao pausar: atualizar Map + gravar arquivo. Ao verificar: checar o Map (leitura em memória, sem I/O por mensagem).

### Mensagem de Notificação de Handoff (HAND-03)

- **D-11:** Mensagem configurável via env var **`HANDOFF_MESSAGE`**. Default em português: `"Um de nossos advogados irá dar continuidade ao seu atendimento em breve. Obrigado pela paciência."`. Consistente com `OPENAI_FALLBACK_MESSAGE` (D-11 da Fase 2) — escritório personaliza sem redeploy.
- **D-12:** A mensagem de handoff **não** recebe o disclaimer de "não constitui aconselhamento jurídico" — é uma mensagem operacional, não resposta de IA. `appendDisclaimer` não é chamado nela.

### Claude's Discretion

- Nome exato do novo service (`handoffService.ts` vs lógica inline em `webhookHandler.ts`)
- Implementação exata do write atômico do arquivo JSON (fs.writeFile + rename vs write direto)
- Campos adicionais de log para eventos de handoff além de `contactId` e `reason`
- Tratamento de erro ao falhar na leitura do arquivo de pausa na inicialização (warn + continuar com Map vazio vs fail-fast)

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Requisitos desta fase
- `.planning/REQUIREMENTS.md` — Critérios de aceitação HAND-01 a HAND-05
- `.planning/ROADMAP.md` — Success criteria da Fase 3 (4 critérios verificáveis)
- `.planning/PROJECT.md` — Constraints de segurança, decisões de arquitetura, out of scope

### Stack e padrões
- `CLAUDE.md` — Stack mandatória, padrões de código, pacotes proibidos
- `.planning/phases/02-conversation-history-ai-pipeline/02-CONTEXT.md` — Decisões D-01 a D-11 da Fase 2 (sessionService, mutex, TTL, padrão de env var para textos configuráveis)
- `.planning/phases/01-webhook-infrastructure-compliance-foundation/01-CONTEXT.md` — Decisões D-01 a D-09 da Fase 1 (lazy eviction, compliance flow, estrutura de guards)

### Código existente relevante
- `src/handlers/webhookHandler.ts` — Ponto de integração: guards chain + pipeline de IA. Handoff guard e detecção do marcador entram aqui.
- `src/services/sessionService.ts` — SessionState: estrutura de sessão. handoffService pode estender ou coordenar.
- `src/services/aiService.ts` — getAIResponse: retorna string com possível [HANDOFF] incluso.
- `src/utils/env.ts` — Zod schema de env vars: adicionar URGENCY_KEYWORDS, HANDOFF_MESSAGE, PAUSED_STATE_FILE.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/handlers/webhookHandler.ts` — Guard chain já estabelecida. Novo guard de urgência entra após Guard 5 (empty text), antes do `runComplianceFlow`. Detecção de `[HANDOFF]` entra após `getAIResponse()`.
- `src/services/sessionService.ts` — `SessionState` pode receber campo `handoffAt?: number` ou lógica de pausa pode viver em `handoffService.ts` separado (decisão do planner).
- `src/utils/env.ts` — Adicionar: `URGENCY_KEYWORDS` (string, opcional com default), `HANDOFF_MESSAGE` (string, opcional com default), `PAUSED_STATE_FILE` (string, opcional com default `./data/paused.json`).
- `src/services/digisacService.ts` — `sendMessage(contactId, text)` — reutilizado para enviar notificação de handoff.

### Established Patterns
- Env vars para textos configuráveis (D-02 da Fase 1, D-11 da Fase 2) → aplicar para `HANDOFF_MESSAGE` e `URGENCY_KEYWORDS`
- Lazy eviction sem setInterval (D-09 da Fase 1) — handoffService segue o mesmo princípio (sem limpeza periódica)
- `logger.child({ contactId })` para logging com contexto — manter para eventos de handoff
- `FallbackAlreadySent` sentinel error pattern (aiService) — considerar padrão similar para `HandoffTriggered`

### Integration Points
- `webhookHandler.ts`: dois novos pontos de inserção:
  1. Após Guard 5 (empty text): `if (isUrgencyKeyword(msg.text)) → triggerHandoff() → return`
  2. Após `getAIResponse()`: `if (aiReply.includes('[HANDOFF]')) → strip marker → send AI text → triggerHandoff() → return`
- `server.ts` ou módulo de inicialização: `await loadPausedState()` na startup

</code_context>

<specifics>
## Specific Ideas

- O guard de urgência deve ser o **Guard 6** na chain de `webhookHandler.ts`, logo após o Guard 5 (empty text body), antes do compliance flow. Isso garante que mensagens de urgência de qualquer lead (mesmo sem consentimento LGPD) recebam resposta imediata.
- Strip do marcador: `aiReply.replace('[HANDOFF]', '').trim()` — simples, sem regex necessária. Se AI retornar `[HANDOFF]` no meio do texto, o restante é preservado.
- O estado de pausa pode ser um singleton exportado de `handoffService.ts` com métodos `pause(contactId, reason)`, `isPaused(contactId)`, `loadFromDisk()`, e `saveToDisk()`.
- Ao iniciar com `data/paused.json` inexistente: criar diretório + arquivo vazio `{}` na primeira pausa. Sem fail-fast — arquivo ausente = nenhum contactId pausado (correto na primeira execução).

</specifics>

<deferred>
## Deferred Ideas

- **HAND-06 (v2)**: Enviar resumo estruturado da qualificação (nome, área, urgência, intenção) ao advogado no momento do handoff — decidido como v2 em REQUIREMENTS.md. Requer segunda chamada à OpenAI.
- **SESS-01 (v2)**: Endpoint de admin para reativar bot para contactId pausado após atendimento humano concluído.
- **Notificação ao advogado**: Alertar o advogado via Digisac quando handoff é disparado — fora do escopo v1, mas frequentemente mencionado.

</deferred>

---

*Phase: 03-lead-qualification-handoff*
*Context gathered: 2026-04-17*
*Revision 1 (2026-04-17): D-07 reason literal changed from "handoff" | "urgency" to "marker" | "urgency" for alignment with PauseRecord interface in plans 03-01/03-02. See D-07 note for rationale.*
