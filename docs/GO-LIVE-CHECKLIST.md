# Go-Live Checklist — botLP (Phase 4 / D-13)

**Criado:** 2026-04-17
**Propósito:** Gates obrigatórios antes de desativar `SANDBOX_MODE` e apontar o webhook do Digisac para o Railway em produção. Nenhum lead real do Meta ADS deve ser atendido enquanto houver gate sem check.

## Gates

| # | Gate | Responsável | Status | Evidência |
|---|------|-------------|--------|-----------|
| 1 | Railway deploy em estado "Deployed/Healthy" e `curl https://<url>/health` retorna `{"status":"ok"}` | Dev | [ ] | URL + timestamp do curl |
| 2 | 3 testes adversariais marcados PASS em `docs/ADVERSARIAL-TESTS.md` | Dev | [ ] | Link para linha da tabela + data |
| 3 | Textos `DISCLOSURE_MESSAGE`, `LGPD_CONSENT_MESSAGE` e `LEGAL_DISCLAIMER` aprovados pelo escritório e configurados no Railway dashboard | Escritório + Dev | [ ] | Aprovação registrada em `docs/COMPLIANCE-TEXTS.md` (seção "Histórico de Aprovação") |
| 4 | Fluxo completo em sandbox: webhook → IA → Digisac send → handoff confirmado com contactId de teste | Dev | [ ] | Logs pino do Railway do ciclo completo |
| 5 | Filtro `isFromMe` + agent-origin confirmado contra tráfego real (bot não responde a si mesmo) | Dev | [ ] | Log `discarded: isFromMe` presente em tráfego real |
| 6 | Limites de uso OpenAI verificados (tier/quota adequado para volume esperado) | Dev | [ ] | Print do dashboard OpenAI ou nota com tier ativo |
| 7 | `PAUSED_STATE_FILE=/data/paused.json` configurado e volume `/data` montado no Railway; verificado que paused.json sobrevive a redeploy | Dev | [ ] | Print do volume no dashboard + teste de persistência |
| 8 | Logs estruturados pino filtráveis no Railway Log Explorer por `contactId`, `event` e `messageId` | Dev | [ ] | Screenshot ou query salva no Railway |
| 9 | `SANDBOX_MODE=false` nas env vars do Railway (ou remoção da variável) | Dev | [ ] | Timestamp da alteração no dashboard |
| 10 | URL do webhook no Digisac atualizada para `https://<url-railway>/digisac/webhook?token=...` | Dev | [ ] | Confirmação visual no dashboard Digisac |

## Procedimento

1. Gates 1, 4, 5, 7, 8 podem ser marcados conforme validação em sandbox (plano 04-02 já concluído).
2. Gate 2 é marcado após task 2 deste plano (execução dos 3 adversariais).
3. Gate 3 é marcado após task 3 (textos finais) E task 5 (checkpoint de aprovação humana).
4. Gate 6 pode ser marcado a qualquer momento — é checagem externa da conta OpenAI.
5. Gates 9 e 10 são os ÚLTIMOS a marcar, executados no checkpoint final (task 5) após todos os demais estarem [x].

## Regra de bloqueio

Se QUALQUER gate 1..8 estiver `[ ]`, não executar os gates 9 e 10. O sandbox deve permanecer ativo.

## Gate 5 — Investigação

**Status:** Pendente de tráfego real no Railway (Railway ainda não configurado em 2026-04-17).

**Implementação verificada no código:**
- `src/handlers/webhookHandler.ts` Guard 2 (linha 114): `if (msg.isFromMe) { logger.debug({ messageId: msg.id }, 'discarded: isFromMe'); return; }`
- O log `discarded: isFromMe` já está implementado com `logger.debug` — aparecerá no Railway Log Explorer quando o Digisac enviar webhook para mensagem outbound do bot

**Procedimento para marcar gate 5 como [x]:**
1. Com Railway em estado Healthy e SANDBOX_MODE=true, enviar uma mensagem normal do WhatsApp pessoal (contactId em SANDBOX_NUMBERS) para o bot
2. Aguardar a resposta do bot chegar no WhatsApp
3. Verificar no Railway Log Explorer: após o envio da resposta pelo bot, deve aparecer log `discarded: isFromMe` (se o Digisac enviar webhook para mensagens outbound)
4. Se o log aparecer: filtro confirmado — marcar `[ ]` → `[x]` na linha do gate 5 acima e adicionar evidência (timestamp + messageId do log)
5. Se o log NÃO aparecer: o Digisac pode não enviar webhook para mensagens outbound (comportamento comum em alguns provedores). Neste caso: Guard 2 continua protegendo contra replay de inbound próprios (mensagens enviadas pelo próprio contato com `isFromMe=true`), mas a validação do loop-prevention contra outbound do bot depende do comportamento do Digisac. Documentar comportamento observado.

**Observação técnica:** Guard 2 verifica `msg.isFromMe` em cada webhook recebido — protege contra mensagens onde o campo `isFromMe` indica que a mensagem foi enviada pelo número conectado ao Digisac. Seja via loop de outbound ou via outras origens, o guard está ativo e logado.

## Pós-go-live

Após gate 10, monitorar nas primeiras 24h:
- Volume de mensagens processadas (logs `processing message`)
- Taxa de handoff (logs `handoff triggered`)
- Taxa de 429 OpenAI (logs `429 fallback`)
- Qualquer erro 500 ou resposta com status diferente de 200 no endpoint webhook
