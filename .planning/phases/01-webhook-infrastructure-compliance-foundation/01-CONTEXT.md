# Phase 1: Webhook Infrastructure + Compliance Foundation - Context

**Gathered:** 2026-04-16
**Status:** Ready for planning

<domain>
## Phase Boundary

Servidor seguro que recebe webhooks do Digisac, valida token, filtra cada evento não acionável, responde HTTP 200 imediatamente, e incorpora disclosure OAB e consentimento LGPD desde a primeira interação — antes de qualquer coleta de dados. A camada de compliance é embutida na entrada; não pode ser retrofitada depois.

Requisitos cobertos: WBHK-01, WBHK-02, WBHK-03, WBHK-04, WBHK-05, WBHK-06, COMP-01, COMP-02, COMP-03, COMP-04, OBS-01, OBS-02.

</domain>

<decisions>
## Implementation Decisions

### Autenticação do Webhook (WBHK-02)

- **D-01:** Token validado como **query param `?token=`** na URL do webhook. O Digisac é configurado com a URL `https://seuapp.railway.app/digisac/webhook?token=SEU_SECRET`. Nosso servidor extrai `req.query.token` e compara com `WEBHOOK_SECRET` via `crypto.timingSafeEqual`. Retorna 401 se inválido.

### Texto de Compliance (COMP-01, COMP-02, COMP-03, COMP-04)

- **D-02:** Textos de compliance configurados via **env vars** (não hardcoded). O escritório ajusta sem re-deploy. Env vars necessárias:
  - `DISCLOSURE_MESSAGE` — mensagem de identificação como IA (COMP-01)
  - `LGPD_CONSENT_MESSAGE` — termo de consentimento LGPD (COMP-02)
  - `LEGAL_DISCLAIMER` — texto appendado a toda resposta da IA (COMP-03)
  - `SYSTEM_PROMPT` — instrui a IA a usar linguagem meramente informativa (COMP-04)
- **D-03:** Placeholders defensivos são implementados na Fase 1 (baseados no Provimento OAB 205/2021 e LGPD). O escritório revisa e substitui antes do deploy em produção com leads reais.
- **D-04:** O disclaimer jurídico é appendado **após** a resposta da IA, separado por linha em branco + `---`. Formato:
  ```
  [resposta da IA]

  ---
  ⚠️ ${LEGAL_DISCLAIMER}
  ```
  O append é feito em código (não apenas no system prompt) para garantir que toda resposta enviada contenha o disclaimer, independente do conteúdo.

### Fluxo de Consentimento LGPD (COMP-02)

- **D-05:** **Qualquer resposta** do lead após o envio do termo de consentimento conta como aceite implícito. Sem exigência de palavra-chave específica — reduz atrito e é adequado para WhatsApp.
- **D-06:** Se o lead enviar uma pergunta sem ter recebido o termo ainda (edge case de histórico), o bot reenvia o termo uma vez. Se o lead ignorar o termo e enviar outra mensagem, trata como aceite implícito e prossegue.
- **D-07:** Estado de consentimento por `contactId` é armazenado em memória junto com o histórico. Na Fase 1, apenas a flag `consentGiven: boolean` é necessária — o histórico completo fica para a Fase 2.

### Estrutura de Arquivos

- **D-08:** Estrutura modular inspirada no `DIGISAC_IA_INTEGRATION.md`, adaptada para TypeScript:
  ```
  src/
    server.ts              # Entry point — configura Express, middlewares, rotas
    routes/
      index.ts             # Define todas as rotas
    services/
      digisacService.ts    # Comunicação com a API REST do Digisac
      aiService.ts         # Comunicação com a Claude API (Fase 2 usa mais)
      complianceService.ts # Disclosure, LGPD consent flow, disclaimer append
    handlers/
      webhookHandler.ts    # Processa eventos recebidos do Digisac
    utils/
      logger.ts            # Instância pino configurada
      env.ts               # Zod schema + validação de env vars na inicialização
    types/
      digisac.ts           # Tipos do payload do webhook Digisac
  ```

### Deduplicação (WBHK-06)

- **D-09:** Deduplicação via `Map<messageId, timestamp>` em memória. TTL de **60 segundos** — suficiente para cobrir retries do Digisac (que ocorrem em segundos). IDs expirados são limpos na próxima verificação (lazy eviction).

### Claude's Discretion

- Implementação interna dos middlewares Express (ordem: helmet → rate-limit → json parser → rotas)
- Formato exato dos logs pino (campos além de `contactId`, `eventType`, `requestId`)
- Lazy eviction vs. setInterval para limpeza do cache de dedup

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Referência técnica da integração
- `DIGISAC_IA_INTEGRATION.md` — Guia completo de integração Digisac + IA: payload do webhook (seção 8.5), endpoints da API Digisac (seção 8), estrutura sugerida (seção 5), env vars de referência (seção 7)

### Stack e bibliotecas
- `CLAUDE.md` — Stack mandatória (Express 5, TypeScript, pino, zod, helmet, express-rate-limit, @ikatec/digisac-api-sdk, @anthropic-ai/sdk), padrões de código, e convenções do projeto

### Requisitos
- `.planning/REQUIREMENTS.md` — Critérios de aceitação detalhados para WBHK-01 a WBHK-06, COMP-01 a COMP-04, OBS-01 a OBS-02
- `.planning/ROADMAP.md` — Success criteria da Fase 1 (5 critérios verificáveis)
- `.planning/PROJECT.md` — Constraints de segurança, ética/legal, e decisões de arquitetura

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- Nenhum código existente — projeto do zero (greenfield)

### Established Patterns
- Nenhum padrão estabelecido ainda — Fase 1 define os padrões para as fases seguintes

### Integration Points
- Digisac envia webhooks POST para `/digisac/webhook?token=<WEBHOOK_SECRET>`
- Nosso servidor chama `POST /messages` na API do Digisac para enviar respostas
- URL base da API Digisac: `DIGISAC_API_URL` (ex: `https://api.sac.digital/v1`)
- Auth da API Digisac: `Authorization: Bearer ${DIGISAC_API_TOKEN}`

</code_context>

<specifics>
## Specific Ideas

- O `@ikatec/digisac-api-sdk` já exporta `WebhookPayload<E>` e tipos tipados — usar para o parsing do payload ao invés de tipos manuais
- O disclaimer append deve acontecer em `complianceService.ts` (não no handler nem na rota) para garantir que nunca seja esquecido quando o AI pipeline for expandido na Fase 2
- O `DIGISAC_IA_INTEGRATION.md` usa `axios` para chamadas à API do Digisac — **não usar**; o SDK `@ikatec/digisac-api-sdk` tem `MessagesApi.create()` nativo com fetch

</specifics>

<deferred>
## Deferred Ideas

- Texto final aprovado pelo escritório para COMP-01, COMP-02, COMP-03 — revisão com stakeholder antes do deploy em produção (STATE.md já tem este blocker registrado)
- SAND-01: Sandbox mode (SANDBOX_MODE env var para responder só a números listados) — aparece no doc de referência mas não está nos requisitos v1; pode ser adicionado na Fase 4 se necessário

</deferred>

---

*Phase: 01-webhook-infrastructure-compliance-foundation*
*Context gathered: 2026-04-16*
