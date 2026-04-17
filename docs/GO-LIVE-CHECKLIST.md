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

## Pós-go-live

Após gate 10, monitorar nas primeiras 24h:
- Volume de mensagens processadas (logs `processing message`)
- Taxa de handoff (logs `handoff triggered`)
- Taxa de 429 OpenAI (logs `429 fallback`)
- Qualquer erro 500 ou resposta com status diferente de 200 no endpoint webhook
