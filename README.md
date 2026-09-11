# Sistema Real de Atendimento Automatizado via WhatsApp (Evolution API + Gemini)

Sistema corporativo de atendimento e qualificação de novos leads via WhatsApp para empresa de adestramento e comportamento canino, integrando a **Evolution API** e o **Google Gemini 3.6 Flash**.

---

## 1. Visão Geral e Arquitetura

O sistema implementa uma arquitetura orientada a regras de negócio críticas e segurança contra alucinações de IA:

```
WhatsApp
  │
  ▼
Evolution API
  │
  ▼ (POST /api/webhooks/evolution)
Webhook Controller
  ├── Validação de Evento & Descarte de Grupos (@g.us)
  ├── Filtro Anti-Loop (fromMe = true)
  └── Idempotência (external_message_id)
  │
  ▼
Banco de Dados Relacional (SQLite / PostgreSQL com Prisma)
  ├── Identificação do Contato (Criação como NOVO_LEAD)
  └── Gatekeeper de Status (NOVO_LEAD / ALUNO / EX_ALUNO / BLOQUEADO)
  │
  ▼
Buffer Inteligente de Mensagens (Debounce com Lock Atômico)
  ├── Janela configurável (MESSAGE_BUFFER_DELAY_MS = 4000ms)
  └── Agrupamento cronológico em entrada única
  │
  ▼
Motor Cognitivo Gemini (GeminiService)
  ├── Prompt do Sistema especializado com defesas anti-prompt-injection
  ├── Memória Estruturada (nome do cão, idade, porte, rotina já coletados)
  └── Resposta em JSON Estrito validado por Zod
  │
  ▼
Gatekeeper do Backend (Decisão de Handoff Humano & Atualização de Lead)
  │
  ▼
Evolution API (sendTextMessage)
  │
  ▼
WhatsApp (Cliente)
```

---

## 2. Regra Absoluta de Status de Contato

Cada contato possui um status rigorosamente controlado pelo backend:

| Status | Comportamento do Backend |
|---|---|
| **`NOVO_LEAD`** | Recebe atendimento comercial automatizado pela IA para qualificação e agendamento. |
| **`ALUNO`** | **Nunca** recebe atendimento comercial pela IA. O backend intercepta, envia mensagem padrão de encaminhamento e transfere a conversa para `HUMAN_ACTIVE`. |
| **`EX_ALUNO`** | **Nunca** recebe atendimento comercial pela IA. O backend intercepta e transfere para atendimento humano. |
| **`BLOQUEADO`** | **Silêncio total**. Nenhuma resposta automática é gerada ou enviada. |

> **IMPORTANTE**: O Gemini nunca pode alterar permissões ou comandos de negócio. Se o lead disser durante o chat *"Já sou aluno"*, o backend registra a informação, pausa a automação comercial (`automatic_service_enabled = false`) e transfere para humano (`HUMAN_ACTIVE`), sem adulterar o status definitivo no banco sem validação humana.

---

## 3. Buffer Inteligente Anti-Metralhadora

Evita respostas fragmentadas quando o tutor envia mensagens sucessivas em rajada:
1. Mensagem recebida -> Salva no banco com status `PENDING`.
2. Adicionada ao buffer com timer de debounce (`MESSAGE_BUFFER_DELAY_MS = 4000ms`).
3. Se nova mensagem chegar dentro da janela -> O timer é cancelado e reiniciado.
4. Quando o período de silêncio expirar -> Adquire lock atômico (`PENDING` -> `PROCESSING`), consolida todas as mensagens pendentes em ordem cronológica e envia um único prompt estruturado ao Gemini.

---

## 4. Requisitos do Sistema

- **Node.js**: v20 ou superior (recomendado v22+)
- **NPM**: v10+
- **Banco de Dados**: SQLite (incluso em `dev.db`) ou PostgreSQL
- **Evolution API**: v1.8+ ou v2.x configurada com instância conectada
- **Google Gemini API Key**: Ativa com acesso aos modelos Gemini 3 Flash

---

## 5. Variáveis de Ambiente (`.env`)

Crie o arquivo `.env` na raiz (baseado no `.env.example`):

```env
# Banco de dados
DATABASE_URL="file:./dev.db"

# Google Gemini API
GEMINI_API_KEY="seu_gemini_api_key_aqui"
GEMINI_MODEL="gemini-3.6-flash"

# Evolution API
EVOLUTION_API_URL="https://sua-evolution-api.com"
EVOLUTION_API_KEY="sua_evolution_api_key_aqui"
EVOLUTION_INSTANCE="SPE"

# Webhook & Segurança
WEBHOOK_SECRET="seu_webhook_secret_aqui"

# Buffer de Mensagens (milissegundos)
MESSAGE_BUFFER_DELAY_MS=4000
```

---

## 6. Instalação e Execução Local

```bash
# 1. Clonar e entrar no diretório
cd atendimento-ia-spe

# 2. Instalar dependências
npm install

# 3. Gerar Prisma Client e sincronizar o banco
npx prisma db push

# 4. Executar os 16 testes obrigatórios
npm test

# 5. Iniciar o servidor de desenvolvimento
npm run dev
```

O painel administrativo estará acessível em: `http://localhost:3000`

---

## 7. Configuração da Evolution API

1. Acesse o painel da sua Evolution API.
2. Na instância (ex.: `SPE`), configure o **Webhook**:
   - **URL**: `https://seu-dominio.com/api/webhooks/evolution` (ou `https://seu-dominio.com/webhooks/evolution`)
   - **Método**: `POST`
   - **Eventos Habilitados**: `MESSAGES_UPSERT` (ou `messages.upsert`)
   - **Webhook By Events**: Ativo
3. Conecte o QR Code da instância no WhatsApp.

---

## 8. Bateria dos 16 Testes Obrigatórios

O sistema inclui uma suite completa automatizada validando todos os cenários críticos:

```bash
npm test
```

Cenários cobertos com 100% de sucesso:
1. **TESTE 1**: Novo número envia `"Oi"` -> Cria contato com `status = NOVO_LEAD` e `automatic_service_enabled = true`.
2. **TESTE 2**: 4 mensagens rápidas consecutivas -> Consolidam em exatamente 1 chamada ao Gemini.
3. **TESTE 3**: 2 mensagens dentro do buffer -> Timer reinicia e agrupa o lote.
4. **TESTE 4**: Mensagem duplicada com mesmo ID -> Idempotência descarta sem processamento duplo.
5. **TESTE 5**: Mensagem originada de grupo (`@g.us`) -> Descartada imediatamente.
6. **TESTE 6**: Mensagem enviada pelo próprio bot (`fromMe = true`) -> Descartada (anti-loop).
7. **TESTE 7**: Contato `ALUNO` envia mensagem -> IA comercial é bloqueada; mensagem padrão de encaminhamento enviada e status vira `HUMAN_ACTIVE`.
8. **TESTE 8**: Contato `EX_ALUNO` envia mensagem -> IA comercial bloqueada.
9. **TESTE 9**: Contato `BLOQUEADO` envia mensagem -> Nenhuma resposta enviada.
10. **TESTE 10**: Atendente assume conversa (Takeover) -> IA é silenciada instantaneamente.
11. **TESTE 11**: Atendente devolve para IA -> IA volta a responder normalmente.
12. **TESTE 12**: Gemini retorna JSON inválido -> Sistema captura erro com Zod, não envia mensagem quebrada e transfere com segurança para atendimento humano.
13. **TESTE 13**: Gemini indisponível (503/offline) -> Registra log em `ai_logs` e transfere para humano.
14. **TESTE 14**: Evolution API offline -> Trata erro de rede sem crash na aplicação.
15. **TESTE 15**: Informações estruturadas (`Thor, 8 meses`) -> Salvas em `lead_data` e `contacts`; nunca mais perguntadas ao tutor.
16. **TESTE 16**: Lead afirma *"Já sou aluno"* durante o chat -> Pausa automação comercial, transfere para humano e preserva o status do banco sem alteração automática arbitrária.

---

## 9. Endpoints da API Interna

| Método | Endpoint | Descrição |
|---|---|---|
| `POST` | `/api/webhooks/evolution` | Webhook receptor da Evolution API |
| `GET` | `/api/contacts` | Lista contatos com filtros por status e busca |
| `GET` | `/api/contacts/:id` | Detalhes do contato e memória estruturada |
| `PATCH` | `/api/contacts/:id` | Atualiza status e dados cadastrais |
| `GET` | `/api/conversations` | Lista conversas para a inbox |
| `GET` | `/api/conversations/:id` | Histórico completo de mensagens da conversa |
| `POST` | `/api/conversations/:id/takeover` | Atendente humano assume o atendimento |
| `POST` | `/api/conversations/:id/return-to-ai` | Devolve o controle do atendimento para a IA |
| `POST` | `/api/conversations/:id/send` | Envia mensagem manual pelo atendente |
| `GET` | `/api/settings` | Obtém configurações do sistema |
| `PATCH` | `/api/settings` | Atualiza parâmetros (ex.: delay do buffer) |
| `GET` | `/api/ai-config` | Obtém prompt e modelo da IA |
| `PATCH` | `/api/ai-config` | Atualiza prompt e parâmetros do Gemini |

---

## 10. Telas do Frontend Funcional

- **`/dashboard`**: Painel com contadores de leads, conversas em atendimento humano, alunos e mensagens.
- **`/conversas`**: Inbox em tempo real com histórico completo de mensagens, alternância entre IA e Humano, envio manual e alteração de status.
- **`/leads`**: Tabela de contatos com filtros por status e busca por tutor, cão ou telefone.
- **`/leads/[id]`**: Prontuário detalhado do lead com todos os atributos extraídos pelo Gemini (`LeadData`).
- **`/configuracoes`**: Painel de ajuste do delay do buffer e textos de redirecionamento.
- **`/ai-config`**: Editor do system prompt, seleção de modelos e hiperparâmetros do Gemini.

---

## 11. Implantação em Produção

1. Construir o bundle de produção:
   ```bash
   npm run build
   ```
2. Iniciar o servidor Node.js:
   ```bash
   npm run start
   ```
3. Para ambientes com alta carga, o banco SQLite pode ser facilmente substituído por PostgreSQL apontando `DATABASE_URL="postgresql://..."` no `.env` e alterando `provider = "postgresql"` no `prisma/schema.prisma`.
