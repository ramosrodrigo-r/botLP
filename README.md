# botLP — Bot de Atendimento IA para Escritório de Advocacia

Bot WhatsApp que qualifica leads automaticamente via IA, integrado ao **Digisac** e **OpenAI**. Quando um lead envia mensagem, o bot responde imediatamente, coleta informações de qualificação (tipo de caso, urgência, intenção de contratar) e transfere para um advogado no momento certo.

## Stack

| | |
|---|---|
| Runtime | Node.js 20 + TypeScript |
| Framework | Express 5 |
| IA | OpenAI GPT-4o via `openai` SDK |
| WhatsApp | Digisac via `@ikatec/digisac-api-sdk` |
| Deploy | Railway (healthcheck em `/health`) |
| Logs | Pino (JSON estruturado) |
| Validação | Zod |

## Funcionalidades

- Recebe webhooks do Digisac e responde leads via WhatsApp
- Histórico de conversa por contato (em memória)
- Qualificação guiada: nome, tipo de caso, urgência, intenção de contratar
- Transferência para humano com bot pausado por contato (sem loop IA + advogado)
- Rate limiting, helmet e validação de token no webhook
- Modo sandbox para testes com tráfego Digisac real antes do go-live
- Compliance OAB: disclaimer legal appendado a toda resposta da IA
- Textos configuráveis: DISCLOSURE_MESSAGE, LGPD_CONSENT_MESSAGE, LEGAL_DISCLAIMER

## Configuração

Copie `.env.example` para `.env` e preencha:

```bash
cp .env.example .env
```

Variáveis obrigatórias:

```env
DIGISAC_API_URL=
DIGISAC_API_TOKEN=
DIGISAC_SERVICE_ID=
WEBHOOK_SECRET=          # mínimo 16 caracteres
OPENAI_API_KEY=
SYSTEM_PROMPT=           # prompt de qualificação do escritório
NODE_ENV=production
```

> Veja `.env.example` para a lista completa com comentários.

## Desenvolvimento

```bash
npm install
npm run dev          # tsx watch — hot reload
npm run typecheck    # tsc sem emitir
```

## Deploy (Railway)

O `railway.json` já está configurado com:
- `healthcheckPath: /health` — Railway valida startup
- `startCommand: node --import tsx/esm src/server.ts` — SIGTERM entregue diretamente ao processo
- Volume persistente em `/data` para `paused.json` (estado de handoff entre redeploys)

Siga o `docs/GO-LIVE-CHECKLIST.md` antes de apontar o Digisac para produção.

## Estrutura

```
src/
  server.ts              # Express app, /health, middlewares
  handlers/
    webhookHandler.ts    # Guard chain (0-7) + pipeline IA
  services/
    complianceService.ts # Disclosure, LGPD consent, disclaimer
    handoffService.ts    # Pausar/retomar bot por contactId
    conversationService.ts # Histórico de conversa em memória
  utils/
    env.ts               # Schema Zod de env vars
docs/
  GO-LIVE-CHECKLIST.md   # 10 gates antes de ir ao ar
  ADVERSARIAL-TESTS.md   # Testes OAB (3 casos)
  COMPLIANCE-TEXTS.md    # Textos DISCLOSURE/LGPD/DISCLAIMER
```

## Segurança

- Nunca commitar `.env` com tokens reais
- `SANDBOX_MODE=true` durante testes — bloqueia todos os leads exceto `SANDBOX_NUMBERS`
- Webhook validado por token via `crypto.timingSafeEqual`
- Bot não fornece aconselhamento jurídico — disclaimer em toda resposta da IA
