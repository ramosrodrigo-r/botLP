# Textos de Compliance OAB + LGPD

**Fonte regulatória:** OAB Provimento 205/2021, Recomendação OAB 001/2024, Lei 13.709/2018 (LGPD).
**Tom (D-09):** Formal mas acessível — linguagem que um lead do Meta ADS entende sem ser advogado. Sem referências técnicas ao Provimento ou à LGPD no texto visível ao lead.
**Status:** RASCUNHO — requer aprovação do escritório antes do go-live (gate 3 do GO-LIVE-CHECKLIST).

## Textos

### DISCLOSURE_MESSAGE (COMP-01 — primeira interação, identifica o bot como IA)

```
Olá! Sou a assistente virtual do [Nome do Escritório]. Atendo automaticamente para entender sua situação e conectá-lo com um de nossos advogados.

Este atendimento é realizado por inteligência artificial e não substitui a consulta com um advogado.
```

**Justificativa:** Provimento 205/2021 exige que o chatbot se identifique como sistema automatizado e não como advogado. A segunda frase deixa explícito que a IA não substitui consulta com humano, prevenindo interpretação de que a conversa constitui aconselhamento.

**O que substituir:** `[Nome do Escritório]` pelo nome oficial do escritório.

### LGPD_CONSENT_MESSAGE (COMP-02 — consentimento antes da coleta de dados)

```
Para prosseguirmos, precisamos registrar algumas informações sobre sua situação jurídica, como seu nome e a natureza do seu caso, para que um advogado possa atendê-lo adequadamente.

Ao continuar esta conversa, você consente com o armazenamento dessas informações pelo escritório. Se tiver dúvidas sobre como seus dados são tratados, entre em contato diretamente conosco.

Pode prosseguir?
```

**Justificativa:** LGPD exige consentimento informado e específico antes da coleta. A mensagem indica (a) quais dados serão coletados, (b) a finalidade, (c) quem é o controlador (o escritório), e (d) canal para dúvidas. O "Pode prosseguir?" dá ao lead escolha explícita — qualquer resposta que não seja afirmativa pode ser tratada como "não prosseguir" em iteração futura (v2).

### LEGAL_DISCLAIMER (COMP-03 — appendado a TODA resposta da IA via código)

```
As informações acima têm caráter meramente informativo e não constituem aconselhamento jurídico. Para orientação específica sobre seu caso, consulte um advogado.
```

**Justificativa:** Provimento 205/2021 proíbe o chatbot de prestar aconselhamento jurídico. Este texto é appendado em código (complianceService.ts) a toda resposta da IA, garantindo presença mesmo se o system prompt falhar em incluir o aviso. Linguagem puramente descritiva sem promessas nem chamadas à ação.

## Bloco .env para Railway Dashboard

Colar no dashboard do Railway (Settings → Variables) substituindo os placeholders existentes. Atenção: Railway interpreta `\n` como literal, não como quebra de linha — escape conforme abaixo:

```
DISCLOSURE_MESSAGE=Olá! Sou a assistente virtual do [Nome do Escritório]. Atendo automaticamente para entender sua situação e conectá-lo com um de nossos advogados.\n\nEste atendimento é realizado por inteligência artificial e não substitui a consulta com um advogado.
LGPD_CONSENT_MESSAGE=Para prosseguirmos, precisamos registrar algumas informações sobre sua situação jurídica, como seu nome e a natureza do seu caso, para que um advogado possa atendê-lo adequadamente.\n\nAo continuar esta conversa, você consente com o armazenamento dessas informações pelo escritório. Se tiver dúvidas sobre como seus dados são tratados, entre em contato diretamente conosco.\n\nPode prosseguir?
LEGAL_DISCLAIMER=As informações acima têm caráter meramente informativo e não constituem aconselhamento jurídico. Para orientação específica sobre seu caso, consulte um advogado.
```

**Verificação do escape:** se o Railway entregar `\n` literal para o processo Node, o WhatsApp mostrará `\n` ao lead. Após configurar, testar no sandbox que as mensagens chegam com quebras de linha corretas. Se não quebrar, usar `$'\n'` em valores multi-linha OU configurar cada variável via UI com botão "multi-line" (se disponível no Railway dashboard).

## Histórico de Aprovação

_(cada versão aprovada é registrada aqui com data, responsável do escritório e qualquer ajuste feito)_

### Versão 1 — RASCUNHO — _(aguardando aprovação)_
- Autor do rascunho: Claude (pesquisa da Phase 4)
- Enviado para revisão em: _(YYYY-MM-DD)_
- Responsável do escritório: _(nome)_
- Status: pending

### Versão 2 (se necessário após revisão) — _(data)_
- Ajustes aplicados: _(descrição)_
- Aprovado em: _(YYYY-MM-DD)_
- Responsável do escritório: _(nome)_
- Status: approved / rejected / needs-rework
