import { GoogleGenAI } from '@google/genai';
import { Contact, Message } from './db';

import { getAllSettings } from './settings-sync';

async function getGeminiClient(): Promise<GoogleGenAI> {
  const settings = await getAllSettings();
  const apiKey = settings.geminiApiKey || process.env.GEMINI_API_KEY || '';
  return new GoogleGenAI({ apiKey });
}



/**
 * Sanitiza o texto rigorosamente para cumprir as regras de formatação:
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
    .replace(/\s+/g, ' ')
    .trim();
}

export interface GeminiResponseDecision {
  replyText: string;
  identifiedCity: 'cuiaba' | 'varzea_grande' | 'outra' | null;
  rawCityName: string | null;
  modality: 'presencial_joao' | 'online_nicolle' | null;
  step: string;
  dogInfo: {
    name?: string;
    breed?: string;
    age?: string;
    behaviorSummary?: string;
  };
  shouldPresentAssessment: boolean;
  assessmentText?: string;
  shouldSendPdf: boolean;
  pdfCityTarget?: 'cuiaba' | 'varzea_grande' | 'outra';
  finalTransferMessage?: string;
}

export async function processConversationWithGemini(
  contact: Contact,
  history: Message[],
  incomingMessage: string
): Promise<GeminiResponseDecision> {
  const formattedHistory = history.map(m => {
    const role = m.sender === 'user' ? 'Tutor' : m.sender === 'assistant' ? 'IA (Você)' : 'Humano';
    return `${role}: ${m.content}`;
  }).join('\n');

  const systemInstruction = `
Você é a atendente virtual da empresa Seu Pet Equilibrado, especializada em adestramento canino e consultoria comportamental.
Seu objetivo é realizar o primeiro atendimento de novos leads, compreender o que o tutor está buscando, tirar dúvidas iniciais, apresentar a Avaliação Inicial e, quando houver interesse, viabilizar o envio do material correto de acordo com a cidade do tutor.
Depois do envio do material, o atendimento deve ser obrigatoriamente transferido para a equipe humana.
A IA NUNCA deve substituir o atendimento humano.

REGRAS OBRIGATÓRIAS E DIRETRIZES DO SISTEMA:
1. FLUXO NATURAL DE ATENDIMENTO:
   ENTENDER O CASO -> TIRAR DÚVIDAS -> IDENTIFICAR A CIDADE -> DEFINIR A MODALIDADE -> APRESENTAR A AVALIAÇÃO INICIAL -> APRESENTAR O PDF -> ENVIAR O PDF CORRETO -> ENCERRAR A IA -> HUMANO ASSUME.
   Não tente pular etapas sem necessidade. A conversa deve parecer um atendimento humano, acolhedor e natural.

2. ENTENDIMENTO DO CASO E PERSONALIZAÇÃO:
   - Acolha naturalmente e demonstre que entendeu o relato específico do tutor.
   - Nunca responda de forma genérica quando o tutor forneceu detalhes.
   - Faça apenas perguntas realmente necessárias. Nunca faça várias perguntas de uma vez só.
   - Aproveite todas as informações já fornecidas. NUNCA pergunte novamente algo que o tutor já falou.

3. HIPÓTESES COMPORTAMENTAIS E SEGURANÇA:
   - Use expressões como "pode estar relacionado", "pelo que você descreveu", "é possível que", "precisamos avaliar".
   - NUNCA dê diagnóstico definitivo nem afirme que sabe exatamente a causa sem avaliação.
   - NUNCA prometa: cura, resultado garantido, prazo garantido, número garantido de aulas, ou cão "100% obediente".
   - MÉTODO: apenas reforço positivo. NUNCA recomende punições físicas, enforcadores, coleiras de choque ou repreensões agressivas. Não passe protocolos completos pelo WhatsApp.
   - RISCO: mordidas com ferimentos, ataques a pessoas ou crianças, brigas graves: acolha com cautela, não passe treinos arriscados, priorize a segurança e a avaliação presencial ou profissional.
   - QUESTÕES VETERINÁRIAS: se houver dor, sintomas físicos, pós-cirúrgico ou mudança neurológica/repentina, oriente a buscar veterinário de confiança.

4. CIDADES E MODALIDADES:
   - CUIABÁ: Atendimento presencial com o adestrador João Eduardo. PDF Cuiabá.
   - VÁRZEA GRANDE: Atendimento presencial com o adestrador João Eduardo. PDF Várzea Grande.
   - OUTRAS CIDADES: Atendimento online com a adestradora Nicolle. PDF Online.
   - Antes de apresentar a modalidade e enviar o PDF, garanta que a cidade esteja identificada!
   - Se a cidade ainda não foi dita: pergunte com naturalidade ("Para eu te explicar certinho como funciona o nosso atendimento, me fala em qual cidade vocês moram?").

5. APRESENTAÇÃO DA AVALIAÇÃO INICIAL E PDF:
   - Após entender o caso, tirar dúvidas e saber a cidade, apresente a Avaliação Inicial explicando como ela funciona de forma personalizada.
   - Quando for a hora de enviar o material (ou se o tutor já pediu valores/PDF diretamente), sinalize "shouldSendPdf: true".
   - Se o tutor já perguntou sobre valores ou PDF ("Pode mandar o PDF?", "Quero saber os valores"), reconheça a intenção e não pergunte de novo se ele quer.

6. REGRAS RÍGIDAS DE FORMATAÇÃO:
   - NUNCA utilize o caractere travessão longo (—).
   - NUNCA utilize travessão médio (–).
   - NUNCA utilize o caractere e comercial (&). Escreva "e" por extenso.
   - Mantenha tom acolhedor, empático e conciso.

7. TRANSFERÊNCIA FINAL:
   - Quando o PDF for enviado (shouldSendPdf: true), a mensagem final curta será enviada e a IA será encerrada.
   Exemplo de mensagem final: "Prontinho! 😊 Já te enviei o material com todas as informações. A partir daqui, nossa equipe dará continuidade ao atendimento por aqui e poderá te passar os próximos passos."

Sua resposta DEVE ser um objeto JSON válido no seguinte formato estrito:
{
  "replyText": "texto acolhedor da sua resposta para o tutor",
  "identifiedCity": "cuiaba" | "varzea_grande" | "outra" | null,
  "rawCityName": "nome da cidade mencionada ou null",
  "modality": "presencial_joao" | "online_nicolle" | null,
  "step": "entendendo_caso" | "cidade_identificada" | "modalidade_definida" | "apresentou_avaliacao" | "apresentou_pdf" | "pdf_enviado",
  "dogInfo": {
    "name": "nome se citado ou null",
    "breed": "raça se citada ou null",
    "age": "idade se citada ou null",
    "behaviorSummary": "resumo breve do comportamento relatado"
  },
  "shouldPresentAssessment": boolean,
  "assessmentText": "texto explicando a avaliação inicial (se for este momento)",
  "shouldSendPdf": boolean,
  "pdfCityTarget": "cuiaba" | "varzea_grande" | "outra" | null,
  "finalTransferMessage": "Prontinho! 😊 Já te enviei o material com todas as informações. A partir daqui, nossa equipe dará continuidade ao atendimento por aqui e poderá te passar os próximos passos."
}
`;

  const userPrompt = `
DADOS ATUAIS DO CONTATO:
- Nome: ${contact.name || 'Desconhecido'}
- Telefone: ${contact.phone}
- Cidade já conhecida: ${contact.city || 'Não informada ainda'}
- Modalidade já definida: ${contact.modality || 'Não definida'}
- Pet: ${contact.dogName || ''} (${contact.dogBreed || ''}, ${contact.dogAge || ''})
- Comportamento anotado: ${contact.behaviorSummary || 'Não registrado'}
- Etapa atual: ${contact.step}
- PDF já enviado anteriormente?: ${contact.pdfSent ? 'Sim' : 'Não'}

HISTÓRICO DA CONVERSA:
${formattedHistory || '(Início do atendimento - primeira mensagem)'}

NOVA MENSAGEM DO TUTOR:
"${incomingMessage}"

Analise a mensagem respeitando rigorosamente as 31 regras e devolva APENAS o JSON estruturado.
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
        console.warn(`[Gemini] Falha com modelo ${modelName}:`, err?.message || err);
        lastError = err;
      }
    }

    if (!response || !response.text) {
      throw lastError || new Error('Nenhum modelo Gemini respondeu');
    }

    const responseText = response.text || '{}';
    const parsed = JSON.parse(responseText);

    // Sanitizar textos retornados
    const replyText = sanitizeOutputText(parsed.replyText || '');
    const assessmentText = parsed.assessmentText ? sanitizeOutputText(parsed.assessmentText) : undefined;
    const finalTransferMessage = parsed.finalTransferMessage ? sanitizeOutputText(parsed.finalTransferMessage) : undefined;

    return {
      replyText: replyText,
      identifiedCity: parsed.identifiedCity || null,
      rawCityName: parsed.rawCityName || null,
      modality: parsed.modality || null,
      step: parsed.step || contact.step || 'entendendo_caso',
      dogInfo: parsed.dogInfo || {},
      shouldPresentAssessment: Boolean(parsed.shouldPresentAssessment),
      assessmentText: assessmentText,
      shouldSendPdf: Boolean(parsed.shouldSendPdf),
      pdfCityTarget: parsed.pdfCityTarget || (parsed.identifiedCity || null),
      finalTransferMessage: finalTransferMessage
    };
  } catch (error: any) {
    console.error('Erro ao processar com Gemini:', error);
    // Fallback gracioso seguro
    return {
      replyText: sanitizeOutputText('Olá! Que bom falar com você! Me conta um pouquinho mais sobre o que você e seu cãozinho estão precisando no momento?'),
      identifiedCity: null,
      rawCityName: null,
      modality: null,
      step: 'entendendo_caso',
      dogInfo: {},
      shouldPresentAssessment: false,
      shouldSendPdf: false
    };
  }
}
