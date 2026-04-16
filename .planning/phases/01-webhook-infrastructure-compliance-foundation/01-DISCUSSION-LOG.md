# Phase 1: Webhook Infrastructure + Compliance Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-16
**Phase:** 01-webhook-infrastructure-compliance-foundation
**Areas discussed:** Texto de compliance, Fluxo de consentimento LGPD, Autenticação do webhook Digisac, Estrutura de arquivos do projeto

---

## Texto de Compliance

| Option | Description | Selected |
|--------|-------------|----------|
| Usar placeholders | Textos de exemplo bem formulados que o escritório ajusta antes de ir ao ar | ✓ |
| Tenho texto aprovado | Wording já validado pelo escritório passado pelo usuário | |
| Claude decide os placeholders | Claude elabora textos defensivos (OAB 205/2021 + LGPD), escritório revisa | |

**User's choice:** Usar placeholders

---

| Option | Description | Selected |
|--------|-------------|----------|
| Env var para os textos | DISCLOSURE_MESSAGE, LGPD_CONSENT_MESSAGE, LEGAL_DISCLAIMER no .env | ✓ |
| Constantes no código | Textos em arquivo TypeScript, requer re-deploy para alterar | |

**User's choice:** Env var para os textos

---

| Option | Description | Selected |
|--------|-------------|----------|
| Após a resposta da IA, separado por linha | [resposta]\n\n---\n⚠️ ${LEGAL_DISCLAIMER} | ✓ |
| Inline no final da resposta | Appendado diretamente sem separador | |

**User's choice:** Após a resposta da IA, separado por linha

---

## Fluxo de Consentimento LGPD

| Option | Description | Selected |
|--------|-------------|----------|
| Qualquer resposta | Qualquer mensagem após o termo = aceite implícito | ✓ |
| Palavra-chave específica | Bot aguarda 'sim'/'aceito' antes de prosseguir | |

**User's choice:** Qualquer resposta (aceite implícito)

---

| Option | Description | Selected |
|--------|-------------|----------|
| Reenvia o termo e aguarda | Reenvia uma vez; se ignorar novamente, trata como aceite implícito | ✓ |
| Confirmação implícita imediata | Qualquer mensagem (incluindo perguntas) ativa o aceite | |

**User's choice:** Reenvia o termo e aguarda

---

## Autenticação do Webhook Digisac

| Option | Description | Selected |
|--------|-------------|----------|
| Token como query param na URL | URL: /webhook?token=SECRET, validado com timingSafeEqual | ✓ |
| Header Authorization | Digisac envia Authorization: Bearer SECRET | |
| Não sei como o Digisac envia | Suporte para ambos, configura via env var | |

**User's choice:** Token como query param na URL

---

## Estrutura de Arquivos do Projeto

| Option | Description | Selected |
|--------|-------------|----------|
| Adaptar DIGISAC_IA_INTEGRATION.md para TS | routes/, services/, handlers/, utils/, types/ | ✓ |
| Estrutura minimalista (flat) | Tudo em src/ sem subpastas | |

**User's choice:** Estrutura modular adaptada do doc de referência

---

## Claude's Discretion

- TTL do cache de dedup: 60 segundos (padrão seguro, não discutido com usuário)
- Implementação interna dos middlewares Express
- Formato exato dos logs pino

## Deferred Ideas

- Texto final aprovado pelo escritório para mensagens de compliance (antes do deploy em produção)
- Sandbox mode (SANDBOX_MODE) — não está nos requisitos v1
