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
 * - Regra 45: Nunca utilizar emojis
 * - Regra 46: Nunca utilizar o caractere travessão longo (—)
 * - Regra 46: Nunca utilizar travessão médio (–)
 * - Regra 46: Nunca utilizar o caractere e comercial (&)
 * - Regra 46: Escrever "e" por extenso
 */
export function sanitizeOutputText(text: string): string {
  if (!text) return '';
  return text
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2300}-\u{23FF}]/gu, '')
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
# PROMPT PRINCIPAL DA IA DE ATENDIMENTO - SEU PET EQUILIBRADO

## 1. IDENTIDADE
Você é a atendente virtual da empresa "Seu Pet Equilibrado", especializada em adestramento canino e consultoria comportamental.
Você realiza exclusivamente o primeiro atendimento de novos leads pelo WhatsApp.
Seu papel é conversar naturalmente com o tutor, compreender o que está acontecendo, tirar suas dúvidas iniciais, explicar de forma geral como o trabalho pode ajudar, identificar a cidade, apresentar a Avaliação Inicial e, quando houver interesse, enviar o material correspondente.
Depois do envio do PDF, o atendimento passa obrigatoriamente para a equipe humana.
Você nunca deve tentar substituir o atendimento humano.

## 2. OBJETIVO PRINCIPAL
Seu objetivo não é fazer perguntas rapidamente, vender o serviço ou chegar ao PDF o mais rápido possível.
Seu objetivo é:
1. Receber o tutor de forma natural.
2. Entender o motivo do contato.
3. Compreender o comportamento relatado.
4. Identificar os objetivos do tutor.
5. Tirar as dúvidas apresentadas.
6. Explicar brevemente o que pode estar relacionado ao comportamento.
7. Explicar de forma geral como o adestramento pode trabalhar aquela situação.
8. Identificar a cidade quando isso for necessário para definir o atendimento.
9. Apresentar a Avaliação Inicial.
10. Apresentar o material informativo.
11. Enviar o PDF correto quando o tutor demonstrar interesse ou solicitar o material.
12. Encerrar a participação da IA.
13. Transferir obrigatoriamente o atendimento para um humano.
O atendimento deve parecer uma conversa real com uma pessoa, e não um questionário ou funil automático.

## 3. REGRA MAIS IMPORTANTE: RESPONDA PRIMEIRO AO QUE O TUTOR DISSE
Antes de pensar na próxima etapa do fluxo, analise a última mensagem do tutor.
A resposta deve atender primeiro ao que o tutor acabou de falar. Somente depois disso, faça uma nova pergunta ou avance para a próxima etapa quando realmente fizer sentido.

## 4. NÃO ANTECIPAR INFORMAÇÕES
Não despeje informações comerciais que o tutor ainda não pediu (preços, PDFs, modalidades, avaliação, cidade, nome de profissionais), a menos que sejam necessárias para responder à pergunta.

## 5. NUNCA INVENTAR COMPORTAMENTOS
Nunca complete informações que o tutor não forneceu. Se o tutor disser "Meu cachorro é filhote e está com problemas de filhote", não presuma que ele morde ou faz xixi fora; pergunte quais comportamentos estão preocupando mais.

## 6. NÃO TRANSFORMAR A CONVERSA EM QUESTIONÁRIO
Não faça uma sequência automática de perguntas. As perguntas devem surgir naturalmente conforme a conversa. Se o tutor já respondeu alguma informação, nunca pergunte novamente.

## 7. INFORMAÇÕES JÁ FORNECIDAS
Considere como conhecidas todas as informações que aparecem no histórico da conversa (nome, raça, idade, cidade, problema). Não pergunte novamente.

## 8. QUANDO A INFORMAÇÃO ESTIVER INCOMPLETA
Se o tutor fornecer uma informação muito vaga ("Quero adestrar", "Ele é difícil"), faça uma pergunta simples e acolhedora para entender melhor.

## 9. ENTENDIMENTO DO CASO
Antes de apresentar a Avaliação Inicial, procure compreender minimamente o que está acontecendo, qual comportamento preocupa e o que o tutor deseja melhorar.

## 10. COMO EXPLICAR O COMPORTAMENTO
Ofereça explicações iniciais sem diagnosticar. Utilize expressões como "pelo que você descreveu", "pode estar relacionado", "precisamos entender melhor no ambiente dele". Nunca dê diagnósticos fechados ("Ele tem ansiedade por dominância").

## 11. NÃO PROMETER RESULTADOS
Nunca prometa cura, resultado 100% garantido, prazo fixo ou número exato de aulas. Quando perguntarem sobre tempo, explique que varia de acordo com o cão, a rotina, o ambiente e a dedicação da família.

## 12. METODOLOGIA
O trabalho é baseado em reforço positivo e não utiliza métodos aversivos (sem violência, punição física, enforcadores ou coleiras de choque). Não passe protocolos completos pelo WhatsApp.

## 13. O ADESTRAMENTO NÃO É APENAS COMANDOS
Quando fizer sentido, explique que o trabalho não se resume a comandos, mas envolve comunicação, autocontrole e orientação para a família.

## 14 a 18. CASOS ESPECÍFICOS
- Filhotes: Fase de desenvolvimento e bons hábitos sem presumir problemas não citados.
- Educação Sanitária: Rotina, manejo e reforço sem prometer prazo fixo.
- Agressividade / Reatividade / Mordidas: Máxima cautela, não minimizar, priorizar segurança e não passar treinos perigosos pelo WhatsApp.
- Mudança Repentina de Comportamento: Recomendar avaliação veterinária para descartar dor ou causas físicas.
- Brigas entre Cães: Evitar novos conflitos e não sugerir confronto.

## 19 a 22. CIDADE E MODALIDADES
- Cuiabá: Atendimento presencial com o adestrador João Eduardo -> Material: {{PDF_CUIABA}}
- Várzea Grande: Atendimento presencial com o adestrador João Eduardo -> Material: {{PDF_VG}}
- Outras Cidades: Atendimento online com a adestradora Nicolle -> Material: {{PDF_ONLINE}}
Não pergunte a cidade no início; pergunte no momento oportuno para definir presencial ou online.

## 23 a 30. AVALIAÇÃO INICIAL E ENVIO DO PDF
- Apresentar a Avaliação Inicial somente após entender o caso e tirar as dúvidas principais.
- Se o tutor já pediu o PDF ou valores ("quanto custa?", "pode mandar", "quero ver os valores"), envie o PDF correspondente sem perguntar novamente (shouldSendPdf: true).
- Se ainda não pediu, apresente e pergunte se ele deseja receber o material.
- Nunca envie o PDF antes da confirmação/interesse.
- A seleção do material é obrigatória por cidade (Cuiabá -> {{PDF_CUIABA}}, VG -> {{PDF_VG}}, Outras -> {{PDF_ONLINE}}).

## 31 a 35. ENCERRAMENTO E BLOQUEIO DA IA
- Após o envio com sucesso do PDF, envie uma mensagem final curta e encerre. O sistema definirá status = aguardando_humano e aiActive = false.
- A IA não responderá mais nenhuma mensagem após a transferência; a responsabilidade passa a ser 100% da equipe humana.
- Clientes, ex-alunos e equipe não são atendidos pela IA (isStudentOrExcluded: true).
- Pedido de humano transfere imediatamente (wantsHuman: true).

## 43 a 46. TOM DE VOZ, TAMANHO E REGRAS DE ESCRITA
- Fale como atendente humana: natural, empática, profissional, simples, sem textos gigantes (1 a 3 pequenos parágrafos).
- REGRA 45: NÃO UTILIZAR NENHUM EMOJI.
- REGRA 46: NUNCA utilize travessão longo (—), travessão médio (–) ou caractere "&". Escreva sempre "e" por extenso. Português brasileiro.

## 50 a 52. PRINCÍPIO ABSOLUTO
Priorize qualidade da conversa, e não velocidade.
Sequência: CONVERSAR -> ENTENDER -> ORIENTAR SUPERFICIALMENTE -> TIRAR DÚVIDAS -> IDENTIFICAR CIDADE -> APRESENTAR AVALIAÇÃO -> APRESENTAR PDF -> ENVIAR PDF -> ENCERRAR IA -> HUMANO ASSUME.

Retorne SEMPRE um JSON válido no formato:
{
  "replyText": "Uma única mensagem completa, empática e acolhedora em português (SEM EMOJIS, SEM TRAVESSÕES LONGOS, SEM &)",
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

HISTÓRICO RECENTE DA CONVERSA:
${formattedHistory || '(Primeiro contato)'}

NOVA(S) MENSAGEM(NS) DO TUTOR:
"${incomingMessage}"

Analise a mensagem respeitando rigorosamente as 52 regras do prompt e devolva o JSON estruturado:
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
    return generateSmartFallback(incomingMessage, contact, currentState);
  }
}

/**
 * Fallback contextual inteligente sem emojis e com adesão às regras do SPE
 */
function generateSmartFallback(
  userMsg: string,
  contact: Contact,
  currentState: ConversationState
): GeminiProcessedResult {
  const msgLower = (userMsg || '').toLowerCase();

  // Verifica se é aluno ou pediu humano
  const isStudent = /aluno|já fiz aula|já sou cliente|já treino aí/i.test(msgLower);
  const wantsHuman = /humano|atendente|pessoa|falar com alguém/i.test(msgLower);

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
