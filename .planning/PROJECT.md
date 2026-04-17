# botLP — Bot de Atendimento IA para Escritório de Advocacia

## What This Is

Servidor Node.js + Express que integra o Digisac (WhatsApp) com a OpenAI API para atender e qualificar leads automaticamente. Quando um lead manda mensagem no WhatsApp, o bot responde, coleta informações de qualificação (tipo de caso, urgência, intenção de contratar) e entrega o lead qualificado para o advogado fechar — transferindo para humano quando a IA não consegue avançar. Desenvolvido para um escritório de advocacia específico.

## Core Value

O lead recebe resposta imediata, é qualificado pela IA (interesse, urgência, tipo de caso) e transferido para um advogado no momento certo — maximizando conversão sem sobrecarregar a equipe.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Qualificar o lead durante a conversa: coletar nome, tipo de caso/área jurídica, urgência e intenção de contratar
- [ ] Conduzir o fluxo de qualificação de forma natural (não parecer formulário) até ter informações suficientes para o advogado fechar
- [ ] Receber webhooks do Digisac com mensagens de leads via WhatsApp
- [ ] Validar origem do webhook (token de segurança) e ignorar mensagens próprias (isFromMe)
- [ ] Manter histórico de conversa por contactId (contexto da IA entre mensagens)
- [ ] Enviar mensagem do lead + histórico para a Claude API e obter resposta
- [ ] Enviar resposta da IA de volta ao lead via API do Digisac
- [ ] Detectar quando a IA não sabe responder e transferir para atendente humano (avisar + pausar bot para aquele contato)
- [ ] System prompt configurável para o contexto de advocacia (tom formal, limites do que pode informar)
- [ ] Rate limiting no endpoint do webhook (proteção contra abuso)
- [ ] Logs estruturados para monitoramento e debug
- [ ] Variáveis de ambiente via `.env` para credenciais e configuração

### Out of Scope

- Multi-tenant / múltiplos clientes — solução para um único escritório em v1
- Responder áudios, imagens ou documentos — somente mensagens de texto em v1
- Dashboard de gerenciamento — sem painel admin em v1; configuração via .env
- Banco de dados persistente em disco — histórico em memória (suficiente para v1, resetado ao reiniciar)
- Agendamento de consultas automático — IA informa disponibilidade mas não integra agenda

## Context

- Integração com **Digisac** (plataforma brasileira de WhatsApp/CRM): webhook recebe eventos, API REST envia mensagens
- OpenAI API via `openai` SDK — modelo `gpt-4o`
- Escritório de advocacia: tom formal, linguagem acessível, nunca dar opinião jurídica definitiva (risco ético/legal) — bot qualifica interesse, informa sobre áreas de atuação, agenda retorno com advogado
- Histórico de conversa em memória (Map<contactId, messages[]>) — suficiente para sessões ativas, sem dependência de banco de dados em v1
- Deploy-agnostic em v1 — código deve funcionar em Railway, VPS ou local sem alterações

## Constraints

- **Segurança**: Nunca versionar `.env` com tokens reais — bot tem acesso a WhatsApp de clientes do escritório
- **Ética/Legal**: System prompt deve incluir disclaimer de que o bot não fornece aconselhamento jurídico — responsabilidade do escritório
- **API Digisac**: Requer HTTPS na URL do webhook — sem suporte a HTTP puro
- **Stack**: Node.js v20+ com Express — conforme especificado no documento de referência

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Histórico em memória (não banco de dados) | Sem complexidade de BD em v1; leads geralmente resolvem em uma sessão | — Pending |
| Handoff: pausar bot por contactId | Evita loop IA + humano respondendo ao mesmo tempo | — Pending |
| Express sem framework de filas | Volume de mensagens de um escritório não justifica Redis/queue em v1 | — Pending |

---

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each phase transition** (via `/gsd-transition`):
1. Requirements invalidated? → Move to Out of Scope with reason
2. Requirements validated? → Move to Validated with phase reference
3. New requirements emerged? → Add to Active
4. Decisions to log? → Add to Key Decisions
5. "What This Is" still accurate? → Update if drifted

**After each milestone** (via `/gsd-complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-04-17 — Phase 03 completa (qualificação de lead + handoff para humano)*
