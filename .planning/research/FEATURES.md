# Feature Landscape: WhatsApp AI Bot for Law Firm (Escritório de Advocacia)

**Domain:** AI-assisted client intake and triage via WhatsApp for a Brazilian law firm
**Researched:** 2026-04-16
**Project context:** Node.js + Express server integrating Digisac webhooks with Claude API

---

## Table Stakes

Features every law firm WhatsApp bot must have. Missing any of these makes the bot either legally risky or unusable.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| **AI identity disclosure** | OAB Recommendation 001/2024 requires transparency about AI use. Meta/WhatsApp also mandates disclosure. Clients must know they are talking to a bot. | Low | First message must identify as bot. "Sou um assistente virtual do [escritório]." |
| **No-legal-advice disclaimer** | OAB Code of Ethics prohibits offering legal opinions without an attorney-client relationship. WhatsApp chatbots create no such relationship. Attorney-client privilege does NOT apply to bot conversations. | Low | Must appear proactively — in the system prompt and in the bot's first or second response. Cannot wait until a user asks. |
| **Human handoff path** | WhatsApp Business Platform policy (2026) requires clear escalation to human agents. Users must always be able to reach a person. OAB ethics also require human oversight on client matters. | Medium | Trigger on: explicit request ("falar com advogado"), bot uncertainty, urgent/criminal matters, emotional distress signals. |
| **Handoff state guard (pause-per-contact)** | Prevents the bot and a human attorney responding simultaneously to the same lead — creates confusion and looks unprofessional. | Medium | The contactId-level pause already planned in PROJECT.md is the correct pattern. |
| **Scope restriction to practice areas** | The bot must not attempt to answer questions outside the firm's areas — doing so creates liability and erodes trust. An out-of-scope answer is worse than no answer. | Low–Medium | Configured via system prompt listing exact practice areas. Bot responds "Essa área não é nossa especialidade; posso indicar nosso contato." |
| **LGPD consent acknowledgment** | Brazil's Lei Geral de Proteção de Dados (Lei 13.709/2018) requires explicit, documented consent before collecting personal data. A WhatsApp conversation collects name, phone number, and case facts — all personal data. | Medium | Bot must present a brief consent statement early in the conversation and log that consent was given (even if only in-memory for v1). |
| **Formal, accessible language tone** | Law firms are regulated professionals. Overly casual language undermines trust. Overly technical language loses leads. The sweet spot is formal but plain Portuguese. | Low | System prompt configuration. Not a code feature — a prompt feature. |
| **Webhook security validation** | The webhook endpoint is publicly accessible. Spoofed requests waste AI tokens and could poison conversation history. | Low | Token-based validation already planned in PROJECT.md. |
| **Ignorar mensagens próprias (isFromMe)** | Without this, the bot reads its own replies as incoming messages and enters infinite self-reply loops. | Low | Already planned in PROJECT.md. |
| **Graceful unknown-input handling** | When the AI cannot determine intent, the bot must not hallucinate an answer or go silent. It must redirect to a human or ask a clarifying question. | Low–Medium | Handled in system prompt + handoff trigger logic. |

---

## Differentiators

Features that make the bot genuinely useful for client intake and lead qualification — beyond basic responsiveness.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| **Structured intake qualification** | Collects: full name, contact phone/email, brief description of the legal issue, urgency level, geographic jurisdiction. This data is what the attorney needs before a consult call — the bot can gather it asynchronously at any hour. | Medium | Requires a prompt engineering strategy: guide conversation toward these fields without feeling like a form. Not a rigid script — LLM-guided collection. |
| **Practice area routing signal** | Bot infers from the lead's description which area of law is involved (family, labor, consumer, criminal, etc.) and mentions that the right specialist will follow up. Gives the attorney a pre-qualified routing tag. | Medium | The routing decision itself stays with humans (anti-feature if automated). The bot just surfaces the signal in the conversation log. |
| **Urgency detection + fast escalation** | Criminal matters, arrests, injunctions, and ameaças (threats) have time-sensitivity that office-hours intake misses. Bot detects urgency keywords and immediately escalates rather than collecting intake data first. | Medium | Needs a curated list of urgency signals: "preso", "mandado", "prazo", "liminar", "audiência amanhã", "violência", "despejo". Immediate handoff + message to duty attorney. |
| **After-hours availability signaling** | Even if no human is available at midnight, the bot acknowledging the message and providing realistic expectations ("Um advogado retornará até X") prevents lead abandonment. | Low | Response template in system prompt. No calendar integration required for v1. |
| **Conversation context persistence across messages** | A lead sends 3 messages over 10 minutes; each must be understood in the prior context. Without this, the bot treats every message as fresh — terrible UX. | Medium | Already planned in PROJECT.md (in-memory Map<contactId, messages[]>). This is a differentiator vs. simpler bots that don't maintain context. |
| **Structured handoff summary** | When transferring to a human, the bot sends the attorney a brief summary of what was collected: who, what area, urgency, key facts stated. Saves the attorney from reading the full transcript. | Medium–High | Requires a second Claude call or a structured summary generation step. Out of scope for v1 but high value for v2. |
| **FAQ deflection for common questions** | "Quanto custa uma consulta?", "Vocês atendem [cidade]?", "Qual o horário de atendimento?" — the bot handles these directly, freeing humans entirely from routine questions. | Low | System prompt configuration with firm-specific facts. Zero code complexity — pure prompt engineering. |

---

## Anti-Features

Things this bot must explicitly NOT do. These are either ethically prohibited, legally risky, or strategically harmful.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| **Give legal opinions or predictions** | Violates OAB Code of Ethics (Art. 34, XI) — mercantilização da advocacia. Creates unauthorized practice of law liability. Attorney-client privilege does not cover bot conversations (confirmed by US courts April 2026; Brazilian courts will follow). | Bot answers: "Não posso opinar sobre seu caso específico. Nosso advogado fará essa análise na consulta." |
| **Promise specific legal outcomes** | OAB Provimento 205/2021 explicitly prohibits "promessas de resultado" in legal advertising — and a chatbot is a client-facing communication channel. | Bot says outcomes depend on individual case facts; attorney will evaluate. |
| **Impersonate a human attorney** | OAB ethics require transparency. WhatsApp Business policy (2026) requires AI disclosure. A bot presenting itself as "Dr. João" would violate both. | Always disclose AI nature. Attorney names appear only in the handoff message introducing the human who will follow up. |
| **Collect sensitive personal data beyond intake scope** | Under LGPD, data collection must be limited to the stated purpose (finalidade). Asking for CPF, financial details, or medical history in a v1 intake bot exceeds the necessary scope and creates data controller obligations the firm may not be ready to fulfill. | Collect only: name, contact, issue description, urgency. Deeper data-gathering happens in the consult. |
| **Attempt to handle media (áudio, imagem, documento)** | Already explicitly out of scope in PROJECT.md — but important to treat this as an anti-feature, not just a limitation. If the bot silently ignores a voice note, the lead thinks the message was lost. | Explicit text response: "No momento só consigo processar mensagens de texto. Por favor, descreva sua situação por escrito." |
| **Automate appointment booking without human confirmation** | Scheduling integrations create commitments the attorney may not honor. A double-booking or missed confirmation creates liability and frustration. | Bot offers available windows from a static list; human confirms and sends calendar link. |
| **Act as a general-purpose AI assistant** | WhatsApp Business Platform policy (effective January 15, 2026) explicitly bans bots offering "open-ended or assistant-style interactions." A law firm bot that answers "What's the weather?" or "Translate this text" violates Meta's terms. | Scope restriction in system prompt: "Você é um assistente de atendimento do [escritório]. Responda apenas sobre assuntos relacionados ao escritório e à consulta jurídica." |
| **Ignore or silently drop messages when paused** | If a human is handling a contact and the bot is paused, the bot must not respond — but if the pause state is lost (server restart, v1 in-memory state) and the bot starts responding again mid-human-conversation, it undermines the handoff. | Log handoff events. Consider persisting pause state even in v1 (a simple JSON file suffices). |
| **Use persuasive or mercantile language** | OAB ethics prohibit "linguagem persuasiva, comercial ou sensacionalista" in legal communications. A bot saying "We're the BEST lawyers in São Paulo!" violates Provimento 205/2021. | Informative only: "Atuamos nas áreas de X, Y, Z. Posso conectar você com um de nossos advogados." |

---

## Feature Dependencies

```
LGPD consent acknowledgment
  → must appear before: intake qualification questions
  → must appear before: any data collection

AI identity disclosure
  → must appear before: any substantive response
  → depends on: first-message detection logic (is this message the first in the conversation?)

No-legal-advice disclaimer
  → must appear in: system prompt (always active)
  → should also appear in: first response AND whenever bot detects a direct legal question

Human handoff
  → depends on: contactId-level pause state
  → depends on: urgency detection (keyword list)
  → depends on: confidence-based escalation (bot "I don't know" signal)
  → triggers: notification to human staff (via Digisac ticket/transfer)

Intake qualification
  → depends on: scope restriction (bot should only collect intake data for in-scope matters)
  → feeds: handoff summary (v2)
  → feeds: practice area routing signal

Practice area routing signal
  → depends on: intake qualification (need case description first)
  → human confirms routing (bot never routes autonomously)

Urgency detection
  → is a sub-type of: human handoff trigger
  → should bypass: intake qualification flow (don't ask "what's your name" when someone says "meu marido foi preso")
```

---

## MVP Recommendation

For v1 (the scope defined in PROJECT.md), prioritize in this order:

**Must have in v1:**
1. AI identity disclosure (first message)
2. No-legal-advice disclaimer (system prompt + triggered response)
3. Human handoff with contactId pause (core feature from PROJECT.md)
4. LGPD consent acknowledgment (first-message template)
5. Scope restriction to practice areas (system prompt)
6. Graceful unknown-input handling

**High value, achievable in v1 via prompt engineering alone (no code changes):**
7. FAQ deflection for common questions
8. After-hours availability signaling
9. Urgency detection keywords → immediate handoff
10. Formal but accessible tone

**Defer to v2:**
- Structured handoff summary (requires second LLM call or structured extraction)
- Persistent intake data logging (requires database)
- Practice area routing with explicit tagging in CRM
- Appointment availability information (requires calendar integration)

---

## Brazilian Legal Market Specifics

### OAB Compliance Requirements
- **Recomendação 001/2024 (Conselho Federal da OAB):** Requires transparency about AI use with clients, human supervision of all AI-generated outputs, and LGPD compliance for all data handled. The attorney remains responsible for everything the bot communicates under the firm's name.
- **Provimento 205/2021 (CFOAB):** Governs all legal advertising and client-facing communications. Chatbots explicitly permitted for "facilitar a comunicação ou melhorar a prestação dos serviços jurídicos" — but must adhere to the "merely informative" standard. No persuasive, commercial, or sensationalist language.
- **Código de Ética e Disciplina (OAB):** Prohibits unauthorized legal opinions. The bot cannot answer "Tenho direito a X?" with a yes or no.

### LGPD Requirements
- Explicit, documented consent before processing personal data (name, phone, case description all qualify).
- Purpose limitation (finalidade): data collected for intake cannot be repurposed.
- Right to erasure: the firm must be able to delete a contact's data on request — in-memory storage makes this trivially easy in v1.
- Privacy policy must exist and be referenceable (the bot can link to it or state it exists).

### WhatsApp Business Platform (2026) Constraints
- General-purpose AI chatbots banned from January 15, 2026.
- A law firm intake bot scoped to legal services intake is NOT general-purpose and is compliant.
- Requires: AI disclosure, human escalation path, and behavior "ancillary to a legitimate business service."
- Digisac uses the official WhatsApp Business API — these rules apply.

---

## Sources

- [OAB Recomendação 001/2024 — Uso de IA na Advocacia](https://www.oab.org.br/noticia/62704/oab-aprova-recomendacoes-para-uso-de-ia-na-pratica-juridica) — HIGH confidence
- [OAB Provimento 205/2021 — Publicidade na Advocacia](https://eticaedisciplina.oab.org.br/provimento) — HIGH confidence
- [Análise do Provimento 205/2021 no contexto digital](https://gandinicomunicacao.com.br/oabsp-o-que-e-permitido-no-marketing-digital-para-advogados) — MEDIUM confidence
- [WhatsApp 2026 AI Chatbot Ban Explained](https://respond.io/blog/whatsapp-general-purpose-chatbots-ban) — HIGH confidence (official Meta policy)
- [AI Chatbots and Attorney-Client Privilege Ruling (April 2026)](https://qz.com/ai-chatbot-attorney-client-privilege-ruling-heppner-041626) — HIGH confidence (recent court ruling)
- [LGPD e Chatbots — Conformidade](https://www.blip.ai/blog/chatbots/lgpd-no-contexto-dos-chatbots/) — MEDIUM confidence
- [Law Firm Chatbot Human Handoff Best Practices](https://cobbai.com/blog/chatbot-escalation-best-practices) — MEDIUM confidence
- [WhatsApp Chatbot for Law Firms — Feature Overview](https://gallabox.com/blog/whatsapp-chatbot-for-law-firms) — MEDIUM confidence
- [AI Lead Qualification for Law Firms](https://golawhustle.com/blogs/ai-lead-qualification-law-firms) — MEDIUM confidence
