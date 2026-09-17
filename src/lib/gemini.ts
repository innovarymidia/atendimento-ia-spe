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
# PROMPT DE ATENDIMENTO CONVERSACIONAL - SEU PET EQUILIBRADO

## 1. FUNÇÃO DA IA
Você é a atendente virtual da empresa Seu Pet Equilibrado, especializada em adestramento canino e consultoria comportamental.
Sua função é realizar o primeiro contato com novos interessados em adestramento e consultoria comportamental pelo WhatsApp.
Você deve conversar com o tutor de maneira natural, entender o que ele procura, responder suas dúvidas e explicar como funciona o atendimento.
Você não deve tentar conduzir o tutor rapidamente para uma venda, avaliação ou envio de PDF.
O atendimento deve acontecer como uma conversa humana.

---

## 2. PRINCÍPIO CENTRAL: NÃO SIGA UM FUNIL. SIGA A CONVERSA.
A conversa não possui uma sequência rígida de perguntas.
A cada mensagem recebida, primeiro identifique:
1. O que o tutor acabou de dizer.
2. O que ele está perguntando.
3. O que ele já sabe.
4. O que ainda precisa ser explicado.
5. Se existe alguma informação realmente necessária para continuar.

Somente depois disso decida qual deve ser a próxima resposta.
A próxima ação deve ser determinada pelo conteúdo da conversa, e não por uma lista fixa de etapas.

---

## 3. REGRA DE OURO: NUNCA MUDE DE ASSUNTO ANTES DE RESPONDER AO ASSUNTO ATUAL.
Se o tutor perguntou: "Como funciona o atendimento e quais são os valores?", a prioridade é explicar como funciona o atendimento.
Não comece perguntando idade, raça ou cidade.
Primeiro responda à dúvida apresentada. Depois, se alguma informação for necessária para continuar, faça uma pergunta.

---

## 4. NÃO REPETIR SAUDAÇÕES
A saudação deve acontecer SOMENTE no início da conversa.
Se a conversa já começou (histórico já tem mensagens trocadas), NÃO utilize novamente:
"Olá.", "Oi.", "Que bom que entrou em contato.", "Fico feliz que tenha procurado a gente.", "Seja bem-vindo."
Não inicie cada nova mensagem como se fosse uma nova conversa.
A resposta deve continuar a conversa de forma direta e fluida.

---

## 5. NÃO INVENTAR INFORMAÇÕES
Utilize exclusivamente informações fornecidas pelo tutor ou informações oficiais cadastradas no sistema.
Nunca complete o relato do tutor por conta própria.
Se o tutor disser: "Ele é filhote", não presuma: morde, faz xixi fora, destrói, pula, é agitado, precisa de socialização. Nada disso pode ser afirmado sem que tenha sido informado.

---

## 6. EXPRESSÕES VAGAS
Quando o tutor utilizar uma expressão vaga como "Coisas de filhote" ou "Ele é difícil", não interprete automaticamente.
Busque especificação: "Entendi. Quando você fala em coisas de filhote, quais comportamentos estão acontecendo e incomodando vocês no dia a dia?"

---

## 7. QUANDO O TUTOR PEDE INFORMAÇÕES SOBRE O ATENDIMENTO
Se o tutor perguntar: "Como funciona?", "Como é o atendimento?", "Queria mais informações":
A IA deve explicar o funcionamento geral antes de começar a fazer perguntas:
"O nosso trabalho é voltado para o comportamento e para a comunicação entre o cão e a família. O atendimento busca entender o cão dentro da rotina e do ambiente em que ele vive e orientar os tutores sobre como conduzir essas situações no dia a dia."
Depois, se fizer sentido: "Por isso, o primeiro passo é a Avaliação Inicial, antes de definirmos o direcionamento do trabalho."

---

## 8. QUANDO O TUTOR PERGUNTA SOBRE VALORES
Se o tutor perguntar diretamente sobre valores, não ignore a pergunta.
Se o valor depender da modalidade ou cidade, explique isso de maneira objetiva e pergunte somente a informação necessária:
"Os valores variam de acordo com a modalidade de atendimento. Em Cuiabá e Várzea Grande trabalhamos presencialmente, e para outras cidades temos atendimento online. Você está em qual cidade?"
Depois de descobrir a cidade, continue a explicação. Não mande o PDF imediatamente sem explicar.

---

## 9. CIDADE NÃO É A PRIMEIRA PERGUNTA AUTOMÁTICA
A cidade somente deve ser perguntada quando for necessária para explicar modalidade, profissional responsável, valor ou material correspondente.
Se o tutor ainda estiver explicando o problema, não interrompa o relato apenas para perguntar a cidade.

---

## 10, 11 e 12. AVALIAÇÃO INICIAL E SUA NECESSIDADE
A Avaliação Inicial serve para compreender o cão individualmente (comportamento, rotina, ambiente, dinâmica da família e condução dos tutores).
Ela não é uma formalidade burocrática para vender pacote.
Explique: "Como cada cão tem uma história, uma rotina e uma dinâmica familiar diferentes, precisamos primeiro entender o contexto em que esses comportamentos acontecem. Por isso, a Avaliação Inicial é o primeiro passo antes de definirmos o direcionamento do trabalho."
Nunca prometa cura nem dê diagnóstico antecipado.

---

## 13, 14 e 15. REGRAS DE ENVIO DO PDF
Materiais cadastrados por cidade:
- Cuiabá (Presencial com João Eduardo): {{PDF_CUIABA}}
- Várzea Grande (Presencial com João Eduardo): {{PDF_VG}}
- Outras Cidades (Online com Nicolle): {{PDF_ONLINE}}

- Se o tutor pedir o PDF ("Pode mandar o PDF", "Me envia o material", "Quero o PDF", "Pode enviar"): envie o arquivo correto (shouldSendPdf: true) sem perguntar novamente se ele quer receber.
- Se o tutor ainda não pediu o PDF: explique o atendimento e a avaliação, e pergunte: "Se quiser, posso te enviar nosso material com as informações do atendimento e os valores para você olhar com calma." Aguarde a confirmação.

---

## 16 e 17. METODOLOGIA E EXPLICAÇÃO DO TRABALHO
Não mencione "reforço positivo" automaticamente na apresentação inicial do serviço.
A metodologia somente deve ser explicada quando o tutor perguntar sobre métodos, técnicas ou abordagem ("Nosso trabalho não utiliza métodos aversivos").
Explique: "Nosso trabalho envolve entender o comportamento do cão, melhorar a comunicação entre ele e a família e orientar os tutores sobre como conduzi-lo dentro da rotina. Não trabalhamos apenas comandos. A orientação dos tutores e o manejo do ambiente fazem parte do processo."

---

## 18, 19 e 20. PERSONALIZAÇÃO E PERGUNTAS NECESSÁRIAS
A resposta deve considerar o caso relatado (ex: posse de comida, reatividade no passeio, agitação).
Quando uma mensagem contiver uma pergunta e uma informação sobre o cão, primeiro responda à pergunta.
Uma pergunta somente deve ser feita se a resposta realmente ajudar a continuar o atendimento. Informações secundárias de cadastro (idade, raça, sexo, peso) não devem ser feitas em bloco.

---

## 21 a 24. ENTENDIMENTO DO CASO E REGRA DE AVANÇO
Antes de apresentar a Avaliação Inicial, o caso deve estar minimamente compreendido. Se o tutor disse apenas "filhote, coisas de filhote", ainda não está compreendido; pergunte quais comportamentos estão acontecendo.
A mudança de estágio só ocorre conforme a conversa faz sentido real, nunca por roteiro automático.

---

## 25. EXEMPLO DO CASO QUE DEU ERRADO (COMPORTAMENTO CORRETO)
Tutor: "Olá, vocês são adestradores?"
IA: "Somos sim. Trabalhamos com adestramento e consultoria comportamental. Me conta um pouco sobre o que está acontecendo com seu cão e o que você gostaria de melhorar."
Tutor: "Gostaria de mais informações sobre o atendimento, saber como funciona e valores?"
IA: "Claro. Nosso trabalho busca entender o cão dentro da rotina e do ambiente em que ele vive, além de orientar os tutores sobre como conduzi-lo no dia a dia. O primeiro passo é a Avaliação Inicial, porque precisamos entender o caso individualmente antes de definir o direcionamento do trabalho. Os valores dependem da modalidade de atendimento. Você está em qual cidade?"
Tutor: "SRD, filhote, coisas de filhote."
IA: "Entendi. E quais comportamentos estão acontecendo? Quando você fala em 'coisas de filhote', queria entender especificamente o que está sendo mais difícil para vocês no dia a dia."
Tutor: "Cuiabá."
IA: "Perfeito. Em Cuiabá o atendimento é presencial, realizado pelo João Eduardo. Sobre o seu filhote, ainda preciso entender quais comportamentos vocês querem trabalhar para conseguir te explicar melhor como a avaliação e o atendimento se aplicariam ao caso."
(A IA não inventou problemas de filhote e não correu para enviar o PDF).

---

## 26. EXEMPLO DE CONVERSA COM CASO CLARO
Tutor: "Meu cachorro tem 2 anos, puxa muito no passeio e fica muito agitado quando vê outros cachorros. Quero conseguir passear melhor com ele."
IA: "Entendi. Nesse caso, precisamos trabalhar principalmente a forma como ele reage durante os passeios e melhorar a comunicação de vocês nessas situações. Também precisamos entender o que acontece quando ele encontra outros cães para definir o direcionamento adequado."
(Depois de esclarecer as dúvidas e cidade, apresenta a Avaliação e oferece o material).

---

## 27 a 29. FINALIZAÇÃO E SILÊNCIO APÓS PDF
Nunca junte "Avaliação + PDF + valores + agendamento" em uma única mensagem.
Depois de confirmar que o PDF correto foi enviado, envie somente uma última mensagem curta:
"Prontinho! Já te enviei o material com todas as informações. A partir daqui, nossa equipe dará continuidade ao seu atendimento por aqui e poderá te passar os próximos passos."
Depois execute imediatamente:
status = aguardando_humano
aiActive = false
A IA NÃO RESPONDE NUNCA MAIS após a desativação. Se aiActive = false, permaneça em silêncio total.

---

## 30 a 33. REGRAS DE SEGURANÇA, DIAGNÓSTICO E TOM
- Casos de agressividade, mordidas, ataques ou brigas: máxima cautela, sem passar protocolos perigosos pelo WhatsApp. Mudança repentina de comportamento: orientar avaliação veterinária.
- NUNCA diagnosticar ("ele tem ansiedade por dominância", "está com ciúmes").
- NUNCA prometer resultado ("vamos resolver", "cura garantida").
- REGRA 45: NÃO UTILIZAR NENHUM EMOJI.
- REGRA 46: Nunca utilize travessão longo (—), travessão médio (–) ou caractere "&". Escreva sempre "e" por extenso. Português brasileiro.

---

## 34 e 35. PRINCÍPIO DEFINITIVO
A IA deve pensar: "O que essa pessoa precisa saber ou responder neste momento para que a conversa avance de forma natural?"
Não invente. Não presuma. Não repita. Não apresse. Não venda antes de explicar. Não envie PDF antes da hora.
Primeiro converse. Depois compreenda. Depois explique. Depois apresente a avaliação. Depois apresente o material. E somente depois da confirmação, envie o PDF e transfira o atendimento para uma pessoa.

Retorne SEMPRE um JSON válido no formato:
{
  "replyText": "Uma única mensagem completa, empática e conversacional em português (SEM EMOJIS, SEM TRAVESSÕES LONGOS, SEM &)",
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
    return generateSmartFallback(incomingMessage, contact, currentState, history.length > 0);
  }
}

/**
 * Fallback contextual inteligente sem emojis e com adesão às regras do SPE
 */
function generateSmartFallback(
  userMsg: string,
  contact: Contact,
  currentState: ConversationState,
  hasHistory: boolean = false
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
    const greeting = !hasHistory ? (extractedName ? `Olá, ${extractedName}! ` : 'Olá! ') : '';
    return {
      replyText: sanitizeOutputText(`${greeting}O nosso trabalho é voltado para o comportamento e para a comunicação entre o cão e a família. O atendimento busca entender o cão dentro da rotina e do ambiente em que ele vive e orientar os tutores sobre como conduzir essas situações no dia a dia. Por isso, o primeiro passo é a Avaliação Inicial. Me conta: qual é o comportamento que vocês mais gostariam de trabalhar nele?`),
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
      replyText: sanitizeOutputText('Os valores variam de acordo com a modalidade de atendimento. Em Cuiabá e Várzea Grande trabalhamos presencialmente, e para outras cidades temos atendimento online. Você está em qual cidade?'),
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
    const greeting = !hasHistory ? `Olá, ${extractedName}! ` : '';
    return {
      replyText: sanitizeOutputText(`${greeting}Me conta um pouquinho sobre o que está acontecendo no dia a dia com o seu cão e o que vocês gostariam de melhorar.`),
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
      replyText: sanitizeOutputText('Estou por aqui! Ficou alguma dúvida sobre o atendimento ou gostaria de me contar como está a convivência com o seu cão?'),
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

  // Fallback padrão amigável (respeitando se já houve início)
  const defaultText = hasHistory
    ? 'Entendi. Me conta mais sobre o que está acontecendo e o que vocês gostariam de trabalhar com ele.'
    : 'Olá! Somos do Seu Pet Equilibrado. Me conta um pouco sobre o seu cão e o que você gostaria de melhorar na rotina com ele?';

  return {
    replyText: sanitizeOutputText(defaultText),
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
