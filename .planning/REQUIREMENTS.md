# Requirements: botLP — Bot de Atendimento IA para Escritório de Advocacia

**Defined:** 2026-04-16
**Core Value:** O lead recebe resposta imediata, é qualificado pela IA (interesse, urgência, tipo de caso) e transferido para um advogado no momento certo — maximizando conversão sem sobrecarregar a equipe.

## v1 Requirements

### Webhook & Infraestrutura

- [x] **WBHK-01**: Servidor retorna HTTP 200 ao Digisac imediatamente (antes de chamar Claude) para evitar reenvios duplicados
- [x] **WBHK-02**: Endpoint valida token de autenticação do Digisac com `crypto.timingSafeEqual` e retorna 401 se inválido
- [x] **WBHK-03**: Sistema ignora mensagens onde `isFromMe === true` (evita loop infinito)
- [x] **WBHK-04**: Sistema ignora eventos que não sejam mensagens de texto (áudios, imagens, documentos)
- [x] **WBHK-05**: Rate limiting no endpoint webhook (máximo 60 requisições/minuto por IP)
- [x] **WBHK-06**: Deduplicação de webhooks por ID de mensagem (Digisac pode reenviar em caso de lentidão)

### Compliance (OAB + LGPD)

- [x] **COMP-01**: Bot envia mensagem de disclosure na primeira interação de cada contato, identificando-se como IA
- [x] **COMP-02**: Bot apresenta termo de consentimento LGPD e aguarda confirmação antes de iniciar a qualificação (coletar dados pessoais)
- [x] **COMP-03**: Código appenda disclaimer "não constitui aconselhamento jurídico" ao final de toda resposta da IA (não apenas no prompt)
- [x] **COMP-04**: System prompt instrui a IA a usar linguagem meramente informativa — sem opinar, prometer resultados ou recomendar ações (OAB Provimento 205/2021)

### Conversa & IA

- [ ] **CONV-01**: Sistema mantém histórico de conversa por contactId (máximo 20 turnos, com TTL de inatividade)
- [ ] **CONV-02**: Sistema usa mutex por contactId para evitar race conditions quando duas mensagens chegam simultâneas
- [ ] **CONV-03**: Histórico é passado à Claude API a cada mensagem, mantendo contexto da conversa
- [ ] **CONV-04**: System prompt é configurável via variável de ambiente `SYSTEM_PROMPT`
- [ ] **CONV-05**: Sistema trata erro 429 (rate limit OpenAI) enviando mensagem de fallback ao lead e registrando para follow-up

### Qualificação de Lead

- [ ] **QUAL-01**: Bot coleta nome do lead durante a conversa de forma natural (não como formulário)
- [ ] **QUAL-02**: Bot identifica a área jurídica do caso (ex: trabalhista, família, cível, criminal)
- [ ] **QUAL-03**: Bot avalia urgência do caso (imediata, semanas, planejamento)
- [ ] **QUAL-04**: Bot determina intenção de contratar (somente consulta, quer contratar, ainda pesquisando)
- [ ] **QUAL-05**: Bot conduz o fluxo de qualificação progressivamente — coleta dados ao longo da conversa, não em bloco

### Handoff para Humano

- [ ] **HAND-01**: IA sinaliza necessidade de handoff com marcador `[HANDOFF]` na resposta quando não consegue ajudar
- [ ] **HAND-02**: Sistema detecta o marcador, remove-o da mensagem e pausa o bot para aquele contactId
- [ ] **HAND-03**: Bot envia mensagem ao lead informando que um advogado irá assumir o atendimento
- [ ] **HAND-04**: Estado de pausa por contactId é persistido em arquivo (sobrevive a restart/deploy do servidor)
- [ ] **HAND-05**: Sistema ignora novas mensagens de leads com handoff ativo (não chama Claude nem envia resposta)

### Observabilidade

- [x] **OBS-01**: Logs estruturados com pino incluindo: contactId, tipo de evento, request-id OpenAI, erros com stack trace
- [x] **OBS-02**: Variáveis de ambiente validadas na inicialização do servidor (falha rápido se faltarem credenciais)

## v2 Requirements

### Handoff Aprimorado

- **HAND-06**: Bot envia resumo estruturado da qualificação (nome, área, urgência, intenção) ao advogado no momento do handoff

### Gestão de Sessão

- **SESS-01**: Admin pode reativar bot para um contactId pausado (após atendimento humano concluído) via endpoint protegido
- **SESS-02**: Bot notifica quando retoma atendimento após handoff resolvido

### Monitoramento

- **MON-01**: Endpoint `/health` retorna status do servidor e últimos erros
- **MON-02**: Métricas de uso: mensagens processadas, handoffs realizados, erros por período

## Out of Scope

| Feature | Reason |
|---------|--------|
| Multi-tenant / múltiplos clientes | v1 para um escritório específico; generalizar adiciona complexidade desnecessária |
| Dashboard admin | Configuração via `.env`; sem UI em v1 |
| Agendamento de consultas | Requer integração com agenda do escritório; fora do escopo de qualificação |
| Resposta a áudios/imagens | Complexidade de transcrição/visão; lead de texto cobre 90% dos casos |
| Banco de dados (Redis/Postgres) | Histórico em memória + arquivo suficiente para volume de escritório pequeno/médio |
| OAuth / autenticação de usuário | Não há interface web; configuração é via `.env` |
| Resumo de handoff em v1 | Requer segunda chamada Claude; advogado lê histórico no Digisac |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| WBHK-01 | Phase 1 | Complete |
| WBHK-02 | Phase 1 | Complete |
| WBHK-03 | Phase 1 | Complete |
| WBHK-04 | Phase 1 | Complete |
| WBHK-05 | Phase 1 | Complete |
| WBHK-06 | Phase 1 | Complete |
| COMP-01 | Phase 1 | Complete |
| COMP-02 | Phase 1 | Complete |
| COMP-03 | Phase 1 | Complete |
| COMP-04 | Phase 1 | Complete |
| CONV-01 | Phase 2 | Pending |
| CONV-02 | Phase 2 | Pending |
| CONV-03 | Phase 2 | Pending |
| CONV-04 | Phase 2 | Pending |
| CONV-05 | Phase 2 | Pending |
| QUAL-01 | Phase 2 | Pending |
| QUAL-02 | Phase 2 | Pending |
| QUAL-03 | Phase 2 | Pending |
| QUAL-04 | Phase 2 | Pending |
| QUAL-05 | Phase 2 | Pending |
| HAND-01 | Phase 3 | Pending |
| HAND-02 | Phase 3 | Pending |
| HAND-03 | Phase 3 | Pending |
| HAND-04 | Phase 3 | Pending |
| HAND-05 | Phase 3 | Pending |
| OBS-01 | Phase 1 | Complete |
| OBS-02 | Phase 1 | Complete |

**Coverage:**
- v1 requirements: 27 total
- Mapped to phases: 27
- Unmapped: 0 ✓

---
*Requirements defined: 2026-04-16*
*Last updated: 2026-04-16 after initial definition*
