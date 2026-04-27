# ADR-001: Estratégia de Deploy — Railway vs VPS

**Data:** 2026-04-20
**Status:** Ativo

## Contexto

Bot de atendimento IA para escritórios de advocacia. Decisão inicial: Railway para o primeiro cliente. Cenário futuro: múltiplos bots para múltiplos clientes (modelo de produto/agência).

## Decisão por cenário

### Cenário 1: 1–4 clientes

**Use Railway.**

- Deploy via git push, SSL automático, logs integrados
- Zero overhead de ops — adequado para validar o modelo de negócio
- Custo aceitável em escala pequena

### Cenário 2: 5+ clientes

**Migre para VPS + Coolify.**

- VPS (Hetzner/DigitalOcean): custo fixo, N bots no mesmo servidor
- Coolify: painel self-hosted estilo Railway — abstraí ops (SSL, deploy, monitoring)
- Ponto de inflexão estimado: 5–8 clientes onde custo Railway supera custo de ops da VPS

## Trade-offs

| Critério | Railway | VPS + Coolify |
|----------|---------|---------------|
| Setup inicial | Zero | Algumas horas |
| Custo 1 cliente | ~$5–20/mês | ~$6–10/mês (VPS compartilhado) |
| Custo 10 clientes | ~$50–200/mês | ~$20–40/mês (mesma VPS) |
| Overhead de ops | Nenhum | Baixo com Coolify |
| IP fixo | Não nativo | Sim |
| Isolamento entre clientes | Total (projetos separados) | Via Docker (você gerencia) |

## Notas

- IP fixo na VPS é vantagem real se o Digisac ou cliente exigir whitelist de IP
- Migração Railway → VPS é simples (Node.js + Express, sem dependências de infra especial)
- Coolify: https://coolify.io — open source, self-hosted, suporta deploy via git
