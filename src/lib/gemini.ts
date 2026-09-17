import { GoogleGenAI } from '@google/genai';
import { Contact, Message } from './db';
import { getAllSettings } from './settings-sync';
import { ConversationState, AttendanceStage } from './conversation-state';
import { logEvent } from './logger';

async function getGeminiClient(): Promise<GoogleGenAI> {
  const settings = await getAllSettings();
  const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({ apiKey });
}

/**
 * Sanitiza o texto rigorosamente para cumprir as regras do SPE:
 * - Nunca utilizar o caractere travessão longo (—)
 * - Nunca utilizar travessão médio (–)
 * - Nunca utilizar o caractere e comercial (&)
 * - Escrever "e" por extenso
 */
export function sanitizeOutputText(text: string): string {
  if (!text) return '';
  return text
    .replace(/—/g, ' - ')
    .replace(/–/g, ' - ')
    .replace(/&/g, ' e ')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export interface GeminiProcessedResult {
  replyText: string;
  identifiedCity: 'cuiaba' | 'varzea_grande' | 'outra' | null;
  rawCityName: string | null;
  modality: 'presencial_joao' | 'online_nicolle' | null;
  newStage: AttendanceStage;
  extractedFacts: {
    dogName?: string;
    dogBreed?: string;
    dogAge?: string;
    dogProblem?: string;
    city?: string;
    userName?: string;
  };
  shouldSendPdf: boolean;
  pdfCityTarget?: 'cuiaba' | 'varzea_grande' | 'outra';
  isStudentOrExcluded: boolean;
  wantsHuman: boolean;
  directQuestionAnswered: boolean;
}

export async function processConversationWithGemini(
  contact: Contact,
  history: Message[],
  incomingMessage: string,
  currentState: ConversationState
): Promise<GeminiProcessedResult> {
  const formattedHistory = history.map(m => {
    const role = m.sender === 'user' ? 'Tutor' : m.sender === 'assistant' ? 'IA (Você)' : 'Humano';
    return `${role}: ${m.content}`;
  }).join('\n');

  const systemInstruction = `
Você é a atendente virtual da empresa "Seu Pet Equilibrado" (SPE), especializada em adestramento canino e consultoria comportamental em Cuiabá e Várzea Grande (presencial) e para todo o Brasil (online).

QUEM É VOCÊ:
- Você é a assistente de atendimento virtual da equipe do Seu Pet Equilibrado.
- Você NÃO é a adestradora pessoal. NUNCA diga "eu vou treinar", "eu vou até sua casa", "eu sou o adestrador".
- Os treinos presenciais em Cuiabá e Várzea Grande são realizados pelo adestrador João Eduardo.
- Os treinos online para outras cidades são realizados pela adestradora Nicolle.

PÚBLICO EXCLUSIVO:
- Você atende EXCLUSIVAMENTE NOVOS LEADS.
- Se o contato disser que já é aluno, já fez aula, ou que o cãozinho já treinou com a SPE, sinalize "isStudentOrExcluded: true". A IA não atende alunos.
- Se o contato pedir para falar com uma pessoa/atendente humano, sinalize "wantsHuman: true".

REGRAS FUNDAMENTAIS DO ATENDIMENTO:
1. NUNCA envie duas mensagens de texto consecutivas. Sua resposta deve ser SEMPRE UMA ÚNICA MENSAGEM CONSOLIDADA E COMPLETA no campo "replyText".
2. RESPONDA SEMPRE A PERGUNTA DIRETA DO TUTOR ANTES DE AVANÇAR NO FLUXO. Se ele perguntou "como funciona?", "qual o valor?", "onde fica?", responda isso prioritariamente!
3. NUNCA repita perguntas sobre informações já conhecidas (nome do cão, idade, raça, cidade). Se o tutor já informou, acolha e use a informação.
4. NUNCA use mensagens genéricas em loop. Se o tutor disse o nome dele ou o problema, converse sobre o que ele acabou de relatar.
5. PREÇOS E AVALIAÇÃO:
   - A Avaliação Inicial é o primeiro passo obrigatório para entender a rotina, ambiente e causas do comportamento.
   - Valores da Avaliação: Cuiabá = R$ 150 | Várzea Grande = R$ 180 | Online = R$ 120.
   - NUNCA invente preços de pacotes ou planos de aula fechados. Os planos são orçados de forma personalizada durante ou após a avaliação.
   - NUNCA prometa cura milagrosa, garantia de 100% ou prazos fixos como "em 3 dias ele para".
6. ENVIO DE MATERIAL/PDF:
   - Só marque "shouldSendPdf: true" se a cidade já for conhecida (Cuiabá, Várzea Grande ou Outra) E (o tutor tiver pedido valores/material OU a conversa tiver chegado no momento de apresentar a avaliação e valores).
   - "pdfCityTarget" deve ser estritamente "cuiaba", "varzea_grande" ou "outra".
   - NUNCA envie PDF se a cidade não for conhecida. Pergunte a cidade primeiro!
7. REGRAS DE TEXTO OBRIGATÓRIAS:
   - NUNCA use travessão longo (—) nem médio (–). Use hífen comum (-) se necessário.
   - NUNCA use o caractere "&". Escreva sempre "e" por extenso.

FLUXO DAS ETAPAS (newStage):
- NOVO_LEAD / SAUDACAO: Acolhimento caloroso e identificação inicial.
- IDENTIFICACAO_DA_NECESSIDADE: Entender queixas comportamentais do cão.
- COLETA_DE_INFORMACOES: Saber detalhes do cãozinho (idade, raça) se ainda faltarem.
- IDENTIFICACAO_DA_CIDADE: Saber em qual cidade o tutor reside para definir atendimento presencial ou online.
- EXPLICACAO_DO_ATENDIMENTO: Explicar como o adestramento comportamental atua no caso dele.
- APRESENTACAO_DA_AVALIACAO: Apresentar a Avaliação Inicial e sua importância.
- APRESENTACAO_DE_VALORES_MATERIAL: Apresentar os valores da avaliação e disponibilizar o material PDF.
- INTERESSE_EM_AGENDAR / AGENDAMENTO: Encaminhamento para a equipe agendar a visita/sessão.
- HUMANO: Quando o lead for aluno, pedir atendente ou requerer intervenção humana.

Retorne SEMPRE um JSON válido no formato:
{
  "replyText": "Uma única mensagem completa, empática e acolhedora em português",
  "identifiedCity": "cuiaba" | "varzea_grande" | "outra" | null,
  "rawCityName": "string ou null",
  "modality": "presencial_joao" | "online_nicolle" | null,
  "newStage": "SAUDACAO" | "IDENTIFICACAO_DA_NECESSIDADE" | "COLETA_DE_INFORMACOES" | "IDENTIFICACAO_DA_CIDADE" | "EXPLICACAO_DO_ATENDIMENTO" | "APRESENTACAO_DA_AVALIACAO" | "APRESENTACAO_DE_VALORES_MATERIAL" | "INTERESSE_EM_AGENDAR" | "HUMANO",
  "extractedFacts": {
    "userName": "nome do tutor se informado ou null",
    "dogName": "nome do cão se informado ou null",
    "dogBreed": "raça se informada ou null",
    "dogAge": "idade se informada ou null",
    "dogProblem": "problema ou comportamento resumido se informado ou null",
    "city": "cidade se informada ou null"
  },
  "shouldSendPdf": boolean,
  "pdfCityTarget": "cuiaba" | "varzea_grande" | "outra" | null,
  "isStudentOrExcluded": boolean,
  "wantsHuman": boolean,
  "directQuestionAnswered": boolean
}
`;

  const userPrompt = `
DADOS DO LEAD JÁ CONHECIDOS:
- Nome do Tutor: ${currentState.nome || contact.name || 'Não informado'}
- Cidade Conhecida: ${currentState.facts.city || contact.city || 'Não informada'}
- Pet: Nome: ${currentState.facts.dogName || contact.dogName || 'Não informado'} | Raça: ${currentState.facts.dogBreed || contact.dogBreed || 'Não informada'} | Idade: ${currentState.facts.dogAge || contact.dogAge || 'Não informada'}
- Problema Relatado: ${currentState.facts.dogProblem || contact.behaviorSummary || 'Não relatado'}
- Etapa Atual: ${currentState.etapa}
- PDF já enviado antes?: ${currentState.material_enviado || contact.pdfSent ? 'Sim' : 'Não'}

HISTÓRICO RECENTE:
${formattedHistory || '(Primeiro contato)'}

MENSAGEM(NS) RECEBIDA(S) DO TUTOR AGORA:
"${incomingMessage}"

Analise o contexto e gere o JSON de resposta única:
`;

  const candidateModels = [
    'gemini-3.5-flash-lite',
    'gemini-3.6-flash',
    'gemini-flash-latest'
  ];

  try {
    const ai = await getGeminiClient();
    let response: any = null;
    let lastError: any = null;

    for (const modelName of candidateModels) {
      try {
        response = await ai.models.generateContent({
          model: modelName,
          contents: [
            { role: 'user', parts: [{ text: systemInstruction + '\n\n' + userPrompt }] }
          ],
          config: {
            responseMimeType: 'application/json',
            temperature: 0.3
          }
        });
        if (response && response.text) {
          break;
        }
      } catch (err: any) {
        console.warn(`[Gemini] Tentativa com modelo ${modelName} falhou:`, err?.message || err);
        lastError = err;
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error('Nenhum modelo Gemini respondeu');
    }

    const parsed = JSON.parse(response.text);

    return {
      replyText: sanitizeOutputText(parsed.replyText || ''),
      identifiedCity: parsed.identifiedCity || null,
      rawCityName: parsed.rawCityName || null,
      modality: parsed.modality || null,
      newStage: (parsed.newStage as AttendanceStage) || currentState.etapa || 'IDENTIFICACAO_DA_NECESSIDADE',
      extractedFacts: parsed.extractedFacts || {},
      shouldSendPdf: Boolean(parsed.shouldSendPdf),
      pdfCityTarget: parsed.pdfCityTarget || (parsed.identifiedCity || null),
      isStudentOrExcluded: Boolean(parsed.isStudentOrExcluded),
      wantsHuman: Boolean(parsed.wantsHuman),
      directQuestionAnswered: Boolean(parsed.directQuestionAnswered)
    };
  } catch (error: any) {
    console.error('[Gemini] Erro na geração com IA. Executando fallback inteligente:', error?.message || error);
    
    // Fallback inteligente contextual baseado na mensagem do cliente
    return generateSmartFallback(incomingMessage, contact, currentState);
  }
}

/**
 * Fallback contextual inteligente para evitar respostas genéricas repetidas
 * mesmo em caso de indisponibilidade da API do Gemini.
 */
function generateSmartFallback(
  userMsg: string,
  contact: Contact,
  currentState: ConversationState
): GeminiProcessedResult {
  const msgLower = (userMsg || '').toLowerCase();

  // Verifica se é aluno ou pediu humano
  const isStudent = /aluno|já fiz aula|já sou cliente/i.test(msgLower);
  const wantsHuman = /humano|atendente|pessoa/i.test(msgLower);

  if (isStudent || wantsHuman) {
    return {
      replyText: sanitizeOutputText('Com certeza! Vou transferir seu contato agora mesmo para um membro da nossa equipe dar continuidade ao seu atendimento por aqui. Um momento!'),
      identifiedCity: null,
      rawCityName: null,
      modality: null,
      newStage: 'HUMANO',
      extractedFacts: {},
      shouldSendPdf: false,
      isStudentOrExcluded: isStudent,
      wantsHuman: true,
      directQuestionAnswered: true
    };
  }

  // Verifica menção de nome do tutor
  const nameMatch = userMsg.match(/me chamo\s+([A-Za-zÀ-ÿ]+)/i) || userMsg.match(/sou\s+(?:o|a)?\s*([A-Za-zÀ-ÿ]+)/i);
  const extractedName = nameMatch ? nameMatch[1] : currentState.nome || contact.name;

  // Se perguntou "como funciona"
  if (/como funciona/i.test(msgLower)) {
    const greeting = extractedName ? `Olá, ${extractedName}!` : 'Olá!';
    return {
      replyText: sanitizeOutputText(`${greeting} Nosso trabalho começa com uma Avaliação Inicial no ambiente do cãozinho, onde analisamos a rotina, o comportamento e as necessidades específicas dele para montar um plano personalizado. Me conta: qual é o comportamento que você mais gostaria de ajustar nele?`),
      identifiedCity: null,
      rawCityName: null,
      modality: null,
      newStage: 'IDENTIFICACAO_DA_NECESSIDADE',
      extractedFacts: extractedName ? { userName: extractedName } : {},
      shouldSendPdf: false,
      isStudentOrExcluded: false,
      wantsHuman: false,
      directQuestionAnswered: true
    };
  }

  // Se perguntou "quanto custa" / valor
  if (/quanto custa|qual o valor|preço|tabela/i.test(msgLower)) {
    return {
      replyText: sanitizeOutputText('Nosso atendimento começa pela Avaliação Inicial presencial ou online. Em Cuiabá o investimento da avaliação é de R$ 150, em Várzea Grande é R$ 180, e o atendimento Online é R$ 120. Para eu te passar o material completinho com todas as informações, me conta em qual cidade vocês moram?'),
      identifiedCity: null,
      rawCityName: null,
      modality: null,
      newStage: 'IDENTIFICACAO_DA_CIDADE',
      extractedFacts: extractedName ? { userName: extractedName } : {},
      shouldSendPdf: false,
      isStudentOrExcluded: false,
      wantsHuman: false,
      directQuestionAnswered: true
    };
  }

  // Se o tutor acabou de se apresentar com nome e queixa
  if (extractedName && !currentState.facts.dogProblem) {
    return {
      replyText: sanitizeOutputText(`Olá, ${extractedName}! Que prazer falar com você! Me conta um pouquinho mais sobre o seu cãozinho: qual o nome dele e quais comportamentos você gostaria de trabalhar ou ajustar no momento?`),
      identifiedCity: null,
      rawCityName: null,
      modality: null,
      newStage: 'IDENTIFICACAO_DA_NECESSIDADE',
      extractedFacts: { userName: extractedName },
      shouldSendPdf: false,
      isStudentOrExcluded: false,
      wantsHuman: false,
      directQuestionAnswered: true
    };
  }

  // Se usuário enviou apenas ponto de interrogação ou mensagem muito curta
  if (/^\?+$/.test(msgLower.trim()) || msgLower.trim().length <= 2) {
    return {
      replyText: sanitizeOutputText('Estou por aqui! Você gostaria de tirar alguma dúvida ou me contar como está a rotina com seu cãozinho no momento?'),
      identifiedCity: null,
      rawCityName: null,
      modality: null,
      newStage: currentState.etapa || 'IDENTIFICACAO_DA_NECESSIDADE',
      extractedFacts: {},
      shouldSendPdf: false,
      isStudentOrExcluded: false,
      wantsHuman: false,
      directQuestionAnswered: true
    };
  }

  // Fallback padrão amigável
  return {
    replyText: sanitizeOutputText('Olá! Que bom falar com você! Como o Seu Pet Equilibrado pode ajudar você e seu cãozinho hoje? Me conta um pouquinho do que você gostaria de melhorar na convivência com ele!'),
    identifiedCity: null,
    rawCityName: null,
    modality: null,
    newStage: 'IDENTIFICACAO_DA_NECESSIDADE',
    extractedFacts: {},
    shouldSendPdf: false,
    isStudentOrExcluded: false,
    wantsHuman: false,
    directQuestionAnswered: true
  };
}
