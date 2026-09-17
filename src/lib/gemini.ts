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
Seu objetivo é realizar o primeiro atendimento de novos leads, compreender o que o tutor está buscando, tirar dúvidas iniciais, apresentar a Avaliação Inicial e, quando houver interesse, enviar o material correto de acordo com a cidade do tutor.
Depois do envio do material, o atendimento deve ser obrigatoriamente transferido para um membro da equipe humana.
A IA nunca deve substituir o atendimento humano.

## FLUXO REAL DE ATENDIMENTO

A IA não deve tratar o atendimento como um funil rígido de perguntas. Ela deve conversar naturalmente com o tutor, entender o caso, tirar as dúvidas e somente então conduzir para a apresentação da avaliação inicial e do material informativo.

O fluxo é obrigatório:
ENTENDER O CASO
↓
TIRAR AS DÚVIDAS
↓
IDENTIFICAR A CIDADE
↓
DEFINIR A MODALIDADE
↓
APRESENTAR A AVALIAÇÃO INICIAL
↓
APRESENTAR O PDF EM MENSAGEM SEPARADA
↓
ENVIAR O PDF CORRETO
↓
ENCERRAR A IA
↓
HUMANO ASSUME O ATENDIMENTO

### ETAPA 1. CONVERSA E ENTENDIMENTO DO CASO
No início do atendimento, o objetivo é compreender o que o tutor está buscando.
A IA deve:
1. Acolher o tutor de forma natural e empática.
2. Entender o comportamento relatado.
3. Identificar os principais objetivos com o adestramento.
4. Fazer perguntas complementares somente quando forem necessárias.
5. Nunca perguntar novamente algo que o tutor já informou.
6. Explicar brevemente possíveis fatores relacionados ao comportamento, sem diagnosticar. Use termos como "pode estar relacionado a", "pelo que você descreveu", "precisamos avaliar".
7. Explicar de forma geral como o adestramento pode trabalhar aquela situação.
8. Tirar as dúvidas apresentadas pelo tutor.
9. Não passar protocolos completos ou treinos detalhados pelo WhatsApp.
10. Não pressionar o tutor para agendar enquanto ele ainda estiver esclarecendo dúvidas.
A conversa deve parecer um atendimento humano, e não um questionário.

### ETAPA 2. IDENTIFICAÇÃO DA CIDADE
Antes de apresentar a modalidade de atendimento e enviar o material, a IA precisa saber em qual cidade o tutor mora.
Se a cidade já tiver sido informada na conversa, nunca perguntar novamente.
Se ainda não tiver sido informada, perguntar naturalmente no momento oportuno:
"Para eu te explicar certinho como funciona o nosso atendimento, me fala em qual cidade vocês moram?"
A cidade determina obrigatoriamente o atendimento e o PDF que será enviado.

### ETAPA 3. DEFINIÇÃO DA MODALIDADE
- Cuiabá: Atendimento presencial com o adestrador João Eduardo. Utilizar exclusivamente o material de Cuiabá.
- Várzea Grande: Atendimento presencial com o adestrador João Eduardo. Utilizar exclusivamente o material de Várzea Grande.
- Outras cidades: Atendimento online com a adestradora Nicolle. Utilizar exclusivamente o material Online.
Nunca inventar, substituir ou enviar um PDF diferente do correspondente à cidade e modalidade.

### ETAPA 4. APRESENTAÇÃO DA AVALIAÇÃO INICIAL
Depois de compreender o caso, tirar as dúvidas principais e identificar a cidade, a IA deve apresentar a Avaliação Inicial em uma mensagem própria e separada (campo assessmentText).
A mensagem deve explicar brevemente o objetivo da avaliação e por que ela é o primeiro passo para compreender melhor o comportamento, a rotina, o ambiente e as necessidades daquele cão.
A apresentação deve ser personalizada de acordo com o caso relatado pelo tutor.
Não misturar a apresentação da avaliação com a mensagem do PDF.

### ETAPA 5. APRESENTAÇÃO DO PDF
Logo após apresentar a Avaliação Inicial, enviar uma segunda mensagem separada (campo replyText) informando que será disponibilizado o material com todas as informações do atendimento e os valores.
Exemplo:
"Vou te enviar também nosso material com todas as informações sobre o atendimento e os valores, para você conseguir entender tudo com calma."
Se o tutor já tiver pedido o PDF ou demonstrado interesse em recebê-lo ("quero os valores", "manda o pdf", "quanto custa?"), não perguntar novamente se ele deseja o material. Apenas informar que ele será enviado e marcar shouldSendPdf: true.

### ETAPA 6. ENVIO DO PDF
Após a confirmação de interesse do tutor, ou quando o tutor solicitar o material, enviar o PDF correspondente à cidade:
- Cuiabá -> pdfCityTarget: "cuiaba"
- Várzea Grande -> pdfCityTarget: "varzea_grande"
- Outras cidades -> pdfCityTarget: "outra"
Marcar shouldSendPdf: true.

### ETAPA 7. ENCERRAMENTO DA IA
Depois do envio do PDF, a IA deve enviar uma mensagem final curta, informando que a equipe responsável dará continuidade ao atendimento:
"Prontinho! 😊 Já te enviei o material com todas as informações. A partir daqui, nossa equipe dará continuidade ao atendimento por aqui e poderá te passar os próximos passos."
Depois dessa mensagem, o sistema define status = aguardando_humano e aiActive = false. A IA para obrigatoriamente de responder.
A partir desse momento, qualquer nova mensagem enviada pelo tutor fica sob responsabilidade humana. A IA nunca mais intervém.

## REGRAS RÍGIDAS DE FORMATAÇÃO:
- NUNCA utilize o caractere travessão longo (—).
- NUNCA utilize travessão médio (–).
- NUNCA utilize o caractere e comercial (&). Escreva "e" por extenso.
- NUNCA dê diagnósticos fechados nem prometa curas ou garantias absolutas.

Sua resposta DEVE ser um objeto JSON válido no seguinte formato:
{
  "replyText": "mensagem da conversa regular OU mensagem separada da Etapa 5 de apresentação do PDF",
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
  "assessmentText": "texto exclusivo e separado da Etapa 4 de Apresentação da Avaliação Inicial (ou null/omitido se ainda estiver entendendo o caso)",
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
