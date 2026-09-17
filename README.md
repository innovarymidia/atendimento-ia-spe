# Seu Pet Equilibrado - Atendimento Automatizado com IA & WhatsApp

Sistema completo de atendimento inteligente para a empresa **Seu Pet Equilibrado**, especializada em adestramento canino e consultoria comportamental (João Eduardo e Nicolle).

Integra **Next.js**, **Google Gemini**, **Evolution API (WhatsApp)** e uma **Camada de Controle Determinística (Guardrail)** para garantir que a IA atenda exclusivamente novos leads, mantendo silêncio absoluto para alunos, equipe interna, contatos pessoais e bloqueios.

---

## 🐾 Principais Funcionalidades

1. **Camada de Proteção Determinística (Pré-IA)**:
   - Toda mensagem recebida via WhatsApp é filtrada deterministicamente antes de qualquer chamada de IA.
   - Contatos cadastrados como **Aluno**, **Ex aluno**, **Equipe**, **Pessoal**, **Parceiro**, **Fornecedor** ou **Bloqueado** não recebem nenhuma mensagem automática.
2. **Sincronização Direta do WhatsApp**:
   - Puxa em 1 clique todas as conversas e contatos ativos na Evolution API da empresa.
3. **Classificação Rápida e em Massa**:
   - Menu direto na tabela para alterar a categoria de qualquer telefone com 1 clique.
   - Seleção múltipla por checkboxes para mover centenas de contatos em lote.
4. **Painel de Conversas ao Vivo (Central de Chat)**:
   - Interface completa estilo WhatsApp Web com histórico de mensagens.
   - **Botão "Assumir Atendimento"**: desativa a IA imediatamente (`aiActive = false`) e passa o controle para o atendente humano.
   - **Botão "Devolver para IA"**: reativa o atendimento automático quando desejado.
   - Envio de mensagens manuais e envio dos PDFs oficiais pelo operador humano.
5. **Motor Gemini com as 31 Regras SPE**:
   - Acolhimento empático com foco exclusivo em reforço positivo (sem métodos aversivos).
   - Não promete curas nem prazos milagrosos.
   - Diferencia comportamento de questões veterinárias.
   - Não repete perguntas de informações já relatadas pelo tutor.
   - **Regra 30**: Eliminação estrita de travessões longos (`—`), médios (`–`) e conversão de `&` para `" e "`.
   - Apresentação da Avaliação Inicial e disparo do material em PDF correspondente por cidade:
     - **Cuiabá**: Presencial com João Eduardo (`PDF_CUIABA`)
     - **Várzea Grande**: Presencial com João Eduardo (`PDF_VG`)
     - **Outras Cidades**: Online com Nicolle (`PDF_ONLINE`)
   - **Transferência Obrigatória**: após o envio do PDF, a IA encerra com mensagem curta e bloqueia respostas automáticas posteriores.

---

## 🛠️ Tecnologias Utilizadas

- **Next.js 16** (App Router, Turbopack)
- **React 19**
- **TypeScript** & **Tailwind CSS**
- **SQLite Nativo** (`node:sqlite` do Node 24)
- **Google Gemini API** (`@google/genai`)
- **Evolution API v2** (WhatsApp Webhook, Text & Media)
- **Lucide Icons**

---

## 🚀 Como Executar

### 1. Clonar e Instalar Dependências

```bash
git clone https://github.com/.../atendimento-ia-spe.git
cd atendimento-ia-spe
npm install
```

### 2. Configurar Variáveis de Ambiente

Crie o arquivo `.env` baseado no `.env.example`:

```env
DATABASE_URL="file:./dev.db"
GEMINI_API_KEY="SUA_CHAVE_GEMINI"
EVOLUTION_API_URL="https://seu-evolution-api.com"
EVOLUTION_API_KEY="SUA_CHAVE_EVOLUTION"
EVOLUTION_INSTANCE_NAME="SPE"
```

### 3. Rodar em Desenvolvimento

```bash
npm run dev
```

Acesse [http://localhost:3000](http://localhost:3000) no navegador.

### 4. Compilar para Produção

```bash
npm run build
npm start
```

---

## 📡 Configuração do Webhook na Evolution API

No painel da Evolution API da sua instância `SPE`, configure a URL do webhook:
- **Webhook URL**: `https://seu-dominio.com/api/webhooks/evolution`
- **Eventos Habilitados**: `MESSAGES_UPSERT`

---

## 🧪 Testes Automatizados

Para rodar a suíte de testes de guardrail, formatação e rotas:

```bash
npx tsx scripts/test-spe-system.ts
```
