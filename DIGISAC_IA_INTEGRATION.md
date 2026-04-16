# Integração IA + Digisac — Guia Completo

Documentação técnica para configurar um servidor de integração que conecta o **Digisac** com uma **IA (OpenAI/GPT-4o)** para responder leads automaticamente via WhatsApp.

---

## Sumário

1. [Visão Geral da Arquitetura](#1-visão-geral-da-arquitetura)
2. [Pré-requisitos](#2-pré-requisitos)
3. [Configurações no Painel Digisac](#3-configurações-no-painel-digisac)
4. [Infraestrutura — Onde Hospedar o Servidor](#4-infraestrutura--onde-hospedar-o-servidor)
5. [Estrutura do Projeto](#5-estrutura-do-projeto)
6. [Instalação e Configuração](#6-instalação-e-configuração)
7. [Variáveis de Ambiente](#7-variáveis-de-ambiente)
8. [Endpoints da API Digisac](#8-endpoints-da-api-digisac)
9. [Fluxo de Funcionamento Detalhado](#9-fluxo-de-funcionamento-detalhado)
10. [Deploy em Produção](#10-deploy-em-produção)
11. [Segurança](#11-segurança)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Visão Geral da Arquitetura

```
┌─────────────────┐        ┌──────────────────────┐        ┌─────────────────┐
│                 │        │                      │        │                 │
│  Lead (WhatsApp)│───────▶│      DIGISAC         │        │  GPT-4o (IA)    │
│                 │        │  (plataforma cliente)│        │  OpenAI API     │
└─────────────────┘        └──────────┬───────────┘        └────────▲────────┘
                                      │                              │
                                      │  webhook POST                │ API call
                                      │  (mensagem recebida)         │
                                      ▼                              │
                           ┌──────────────────────┐                 │
                           │                      │─────────────────┘
                           │  SEU SERVIDOR        │
                           │  (Node.js + Express) │
                           │                      │─────────────────┐
                           └──────────────────────┘                 │
                                      ▲                              │ POST /message
                                      │                              │ (resposta ao lead)
                                      └──────────────────────────────┘
```

### Resumo do fluxo

1. Lead envia mensagem no WhatsApp
2. Digisac recebe e dispara um **webhook** para o seu servidor
3. Seu servidor extrai o texto e envia para a **OpenAI API**
4. GPT-4o processa e retorna a resposta
5. Seu servidor chama a **API do Digisac** para enviar a resposta ao lead

---

## 2. Pré-requisitos

### Do lado do cliente (Digisac)
- Conta ativa no Digisac com WhatsApp conectado
- Acesso de **administrador** ao painel
- Número WhatsApp funcional (WABA ou número convencional)

### Do lado técnico
- **Node.js** v20.17.0 ou superior
- **npm** v10.x ou superior
- Servidor com **IP/domínio público** (para receber webhooks)
- Chave de API da **OpenAI**
- Opcional: Docker e Docker Compose

### Chaves necessárias

| Chave | Onde obter |
|-------|-----------|
| `DIGISAC_API_TOKEN` | Painel Digisac → Conta → Token e Webhook |
| `DIGISAC_API_URL` | Exibida na mesma tela do token (ex: `https://api.sac.digital/v1`) |
| `OPENAI_API_KEY` | [platform.openai.com/api-keys](https://platform.openai.com/api-keys) |

---

## 3. Configurações no Painel Digisac

### 3.1 Gerando o Token de API

1. Acesse o painel do Digisac com uma conta **administrador**
2. Clique no ícone de perfil (canto superior direito) → **Conta**
3. Vá até a aba **"API"** ou **"Token e Webhook"**
4. Clique em **"Gerar Token"**
5. **Copie e salve imediatamente** — o Digisac exibe o token completo **apenas uma vez**
6. Anote também a **URL base da API** exibida na mesma tela

> ⚠️ **Atenção:** Se perder o token, será necessário revogar e gerar um novo. Guarde em um gerenciador de senhas (Bitwarden, 1Password, etc.).

### 3.2 Configurando o Webhook

O webhook é o mecanismo pelo qual o Digisac avisa seu servidor toda vez que uma mensagem é recebida.

1. Na mesma tela de Token e Webhook, clique em **"Webhooks"**
2. Clique em **"Novo Webhook"**
3. Preencha os campos:

| Campo | Valor |
|-------|-------|
| **Nome** | `Integração IA` (ou qualquer nome descritivo) |
| **URL** | `https://seudominio.com/digisac/webhook` |
| **Tipo** | `Geral` |
| **Eventos** | Marque: `message.received` (mensagem recebida) |

4. Clique em **Salvar**

> **Tipo Geral** recebe eventos de todas as conexões. Se quiser filtrar por número específico, use **Tipo Conexão** e selecione o número desejado.

### 3.3 Eventos disponíveis no Webhook

| Evento | Descrição |
|--------|-----------|
| `message.received` | Nova mensagem recebida de um contato |
| `message.sent` | Mensagem enviada pela plataforma |
| `ticket.created` | Novo ticket aberto |
| `ticket.updated` | Ticket atualizado |
| `contact.created` | Novo contato criado |
| `funnel.created` | Oportunidade criada no funil |
| `funnel.updated` | Oportunidade atualizada no funil |

Para responder leads automaticamente, o evento essencial é `message.received`.

---

## 4. Infraestrutura — Onde Hospedar o Servidor

O webhook do Digisac precisa de uma **URL pública e acessível pela internet**. Uma VPN não serve para isso — VPN cria acesso privado, mas o Digisac precisa de um endereço que ele consiga alcançar de fora.

### Opções de hospedagem

| Plataforma | Custo estimado | Dificuldade | Ideal para |
|-----------|---------------|-------------|------------|
| **Railway** | Grátis (500h/mês) a ~R$25/mês | Fácil | Testes e produção leve |
| **Render** | Grátis (com cold start) a ~R$35/mês | Fácil | Testes |
| **Hetzner VPS** (CX11) | ~R$20/mês | Médio | Produção |
| **DigitalOcean Droplet** | ~R$30/mês | Médio | Produção |
| **Contabo VPS** | ~R$15/mês | Médio | Produção custo-benefício |
| **AWS EC2 t3.micro** | ~R$40/mês | Alto | Produção escalável |

### Recomendação

Para um cliente pequeno/médio: **Railway** ou **Hetzner CX11**.

- Railway é o mais simples para subir rapidamente (deploy via GitHub)
- Hetzner dá mais controle e é barato para produção

### Requisitos mínimos do servidor

- 512 MB RAM
- 1 vCPU
- Ubuntu 22.04 LTS
- Porta 80/443 aberta
- Certificado SSL (obrigatório — Digisac só aceita HTTPS)

---

## 5. Estrutura do Projeto

```
botLP/
├── src/
│   ├── server.js              # Ponto de entrada — configura Express
│   ├── routes/
│   │   └── index.js           # Define todas as rotas
│   ├── services/
│   │   ├── digisacService.js  # Comunicação com a API do Digisac
│   │   └── aiService.js       # Comunicação com a OpenAI API
│   ├── handlers/
│   │   └── webhookHandler.js  # Processa eventos recebidos do Digisac
│   └── utils/
│       ├── logger.js          # Logs estruturados
│       └── phoneValidator.js  # Valida números brasileiros
├── .env                       # Variáveis de ambiente (não versionar!)
├── .env.example               # Exemplo das variáveis necessárias
├── .gitignore
├── package.json
├── docker-compose.yml         # Para rodar com Docker
└── README.md
```

---

## 6. Instalação e Configuração

### 6.1 Clonar e instalar dependências

```bash
git clone https://github.com/seu-usuario/botLP.git
cd botLP
npm install
```

### 6.2 Instalar dependências necessárias

```bash
npm install express dotenv openai
npm install --save-dev nodemon
```

### 6.3 Criar o arquivo `.env`

```bash
cp .env.example .env
# Edite o arquivo com suas credenciais
nano .env
```

### 6.4 Iniciar em desenvolvimento

```bash
npm run dev
```

### 6.5 Iniciar em produção

```bash
npm start
```

### 6.6 Com Docker

```bash
docker-compose up --build -d
```

---

## 7. Variáveis de Ambiente

Crie um arquivo `.env` na raiz do projeto com as seguintes variáveis:

```env
# ─── Digisac ──────────────────────────────────────────────
DIGISAC_API_URL=https://api.sac.digital/v1
DIGISAC_API_TOKEN=seu_token_digisac_aqui

# ID do serviço/conexão padrão (número WhatsApp configurado no Digisac)
DIGISAC_SERVICE_ID=id_do_servico_aqui

# ─── OpenAI ───────────────────────────────────────────────
OPENAI_API_KEY=sk-...

# Modelo a usar (recomendado: gpt-4o)
OPENAI_MODEL=gpt-4o

# Prompt de sistema — define como a IA se comporta
SYSTEM_PROMPT="Você é um assistente de atendimento. Responda de forma cordial, objetiva e profissional. Quando não souber uma informação, oriente o cliente a aguardar um atendente humano."

# ─── Servidor ─────────────────────────────────────────────
PORT=3000
NODE_ENV=production

# ─── Modo Sandbox (opcional) ──────────────────────────────
# Em modo sandbox, só responde para os números listados
SANDBOX_MODE=false
SANDBOX_NUMBERS=5511999999999,5511888888888
```

### Arquivo `.env.example` (versionar este, não o `.env`)

```env
DIGISAC_API_URL=
DIGISAC_API_TOKEN=
DIGISAC_SERVICE_ID=
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
SYSTEM_PROMPT=
PORT=3000
NODE_ENV=development
SANDBOX_MODE=false
SANDBOX_NUMBERS=
```

---

## 8. Endpoints da API Digisac

A URL base é a fornecida no painel: `https://api.sac.digital/v1`

Todas as requisições exigem o header:
```
Authorization: Bearer SEU_TOKEN_AQUI
Content-Type: application/json
```

### 8.1 Enviar mensagem de texto

```
POST /messages
```

**Body:**
```json
{
  "text": "Olá! Em que posso ajudar?",
  "contactId": "id_do_contato",
  "serviceId": "id_do_servico",
  "userId": "id_do_usuario_atendente"
}
```

**Resposta de sucesso:**
```json
{
  "id": "msg_abc123",
  "status": "sent",
  "createdAt": "2026-04-16T10:00:00Z"
}
```

### 8.2 Buscar contato por telefone

```
GET /contacts?phone=5511999999999
```

### 8.3 Criar contato

```
POST /contacts
```

```json
{
  "name": "João Silva",
  "phone": "5511999999999",
  "serviceId": "id_do_servico"
}
```

### 8.4 Listar serviços (conexões)

```
GET /services
```

Retorna os números/conexões WhatsApp configurados no Digisac. Use para pegar o `serviceId` correto.

### 8.5 Payload recebido no Webhook

Quando o Digisac dispara o webhook para seu servidor, o corpo da requisição tem este formato:

```json
{
  "event": "message.received",
  "data": {
    "id": "msg_xyz789",
    "text": "Olá, quero saber mais sobre o produto",
    "type": "text",
    "isFromMe": false,
    "contact": {
      "id": "contact_123",
      "name": "Maria Souza",
      "phone": "5511988887777"
    },
    "service": {
      "id": "service_456",
      "name": "WhatsApp Principal"
    },
    "ticket": {
      "id": "ticket_789",
      "status": "open"
    },
    "createdAt": "2026-04-16T10:30:00Z"
  }
}
```

---

## 9. Fluxo de Funcionamento Detalhado

### 9.1 Recebendo o webhook

```
POST /digisac/webhook
```

Seu servidor deve:

1. Validar que `event === "message.received"`
2. Verificar que `isFromMe === false` (ignora mensagens enviadas por você)
3. Verificar que `type === "text"` (ignora áudios, imagens, etc. — por enquanto)
4. Extrair `text`, `contact.id`, `contact.phone`, `service.id`

### 9.2 Chamando a IA

Com o texto extraído, chama a OpenAI API:

```javascript
const response = await openai.chat.completions.create({
  model: process.env.OPENAI_MODEL || "gpt-4o",
  messages: [
    { role: "system", content: process.env.SYSTEM_PROMPT },
    { role: "user", content: mensagemDoLead }
  ]
});

const respostaIA = response.choices[0].message.content;
```

### 9.3 Enviando a resposta

Com a resposta da IA, chama a API do Digisac:

```javascript
await axios.post(
  `${process.env.DIGISAC_API_URL}/messages`,
  {
    text: respostaIA,
    contactId: contact.id,
    serviceId: service.id
  },
  {
    headers: {
      Authorization: `Bearer ${process.env.DIGISAC_API_TOKEN}`
    }
  }
);
```

### 9.4 Diagrama de sequência

```
Lead          Digisac         Seu Servidor        OpenAI API
 │               │                  │                  │
 │──mensagem────▶│                  │                  │
 │               │──webhook POST───▶│                  │
 │               │                  │──chat.completions▶│
 │               │                  │◀─resposta────────│
 │               │◀─POST /messages──│                  │
 │◀──resposta────│                  │                  │
```

---

## 10. Deploy em Produção

### 10.1 Railway (recomendado para início)

1. Crie conta em [railway.app](https://railway.app)
2. Novo projeto → **Deploy from GitHub repo**
3. Selecione o repositório
4. Vá em **Variables** e adicione todas as variáveis do `.env`
5. Railway gera automaticamente uma URL pública (`https://seuapp.railway.app`)
6. Use essa URL no webhook do Digisac

### 10.2 VPS com Ubuntu (produção robusta)

```bash
# 1. Conectar no servidor
ssh root@ip-do-servidor

# 2. Instalar Node.js
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs

# 3. Instalar PM2 (gerenciador de processos)
npm install -g pm2

# 4. Clonar o projeto
git clone https://github.com/seu-usuario/botLP.git
cd botLP
npm install

# 5. Criar o .env
nano .env
# (preencher com as variáveis)

# 6. Iniciar com PM2
pm2 start src/server.js --name "botLP"
pm2 save
pm2 startup

# 7. Configurar Nginx como proxy reverso
sudo apt install -y nginx
```

**Configuração do Nginx (`/etc/nginx/sites-available/botlp`):**

```nginx
server {
    listen 80;
    server_name seudominio.com;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

```bash
# Ativar o site
sudo ln -s /etc/nginx/sites-available/botlp /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx

# 8. SSL gratuito com Certbot
sudo apt install -y certbot python3-certbot-nginx
sudo certbot --nginx -d seudominio.com
```

### 10.3 Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  botlp:
    build: .
    container_name: botlp
    restart: unless-stopped
    ports:
      - "3000:3000"
    env_file:
      - .env
    environment:
      - NODE_ENV=production
```

```bash
docker-compose up -d
docker-compose logs -f
```

---

## 11. Segurança

### 11.1 Nunca versionar o `.env`

Adicione ao `.gitignore`:

```
.env
node_modules/
```

### 11.2 Validar origem do webhook

O Digisac pode enviar um header de autenticação. Valide sempre:

```javascript
app.post('/digisac/webhook', (req, res) => {
  const token = req.headers['x-digisac-token'];
  if (token !== process.env.WEBHOOK_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  // ...processar
});
```

### 11.3 Evitar loop de mensagens

Sempre verifique `isFromMe === false` antes de chamar a IA — caso contrário, o bot responde suas próprias mensagens e entra em loop infinito.

```javascript
if (data.isFromMe) return res.status(200).json({ ignored: true });
```

### 11.4 Rate limiting

Proteja o endpoint de webhook contra abuso:

```bash
npm install express-rate-limit
```

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minuto
  max: 60                   // máximo 60 requisições por minuto
});

app.use('/digisac/webhook', limiter);
```

### 11.5 Rotacionar tokens periodicamente

- Token Digisac: rotacionar a cada 90 dias
- Chave Anthropic: monitorar uso no dashboard

---

## 12. Troubleshooting

### Webhook não está sendo recebido

- Verifique se a URL no painel Digisac está correta e acessível (teste com `curl`)
- Certifique-se de que o servidor está rodando na porta correta
- Confirme que o SSL está válido (Digisac rejeita HTTP)
- Teste localmente com [ngrok](https://ngrok.com): `ngrok http 3000`

### Mensagem enviada mas lead não recebe

- Verifique se o `contactId` e `serviceId` estão corretos
- Confirme que o token não expirou
- Cheque os logs da API Digisac na resposta do POST

### IA respondendo fora do contexto

- Refine o `SYSTEM_PROMPT` no `.env`
- Adicione exemplos de como responder no prompt de sistema
- Considere armazenar histórico de conversa por `contactId` para dar contexto à IA

### Erro 401 na API Digisac

- Token inválido ou não copiado corretamente
- Acesse o painel e gere um novo token

### Bot respondendo mensagens enviadas por atendentes

- Adicione verificação de `isFromMe` e também filtrar por tipo de origem
- Algumas configurações do Digisac permitem identificar se a mensagem veio de um atendente humano — verifique o campo `origin` no payload do webhook

---

## Referências

- [Manual Digisac — Token e Webhook](https://digisac.gitbook.io/manual-digisac-2-0/token-e-webhook)
- [Manual Digisac — Integrações](https://digisac.gitbook.io/manual-digisac-2-0/mais-opcoes/integracoes)
- [Documentação API Digisac (Postman)](https://documenter.getpostman.com/view/24605757/2sA3BhfaDg)
- [OpenAI API Docs](https://platform.openai.com/docs)
- [Repositório de referência — custom-channel-integration](https://github.com/manoelbo/custom-channel-integration-respond-digisac)
