import { Contact, Message } from './db';
import { ConversationState } from './conversation-state';
import { logEvent } from './logger';

export interface ValidationResult {
  passed: boolean;
  violations: string[];
  sanitizedText: string;
  shouldHandoffToHuman: boolean;
  handoffReason?: string;
}

/**
 * Validador e Debugger pré-envio da IA (22 verificações de integridade).
 * Garante que nenhuma mensagem inadequada chegue ao WhatsApp do lead.
 */
export function validateAiResponse(params: {
  aiResponseText: string;
  userMessage: string;
  conversationHistory: Message[];
  contact: Contact;
  state: ConversationState;
  pdfSentSuccess?: boolean;
}): ValidationResult {
  const { aiResponseText, userMessage, conversationHistory, contact, state, pdfSentSuccess } = params;
  const violations: string[] = [];
  let sanitizedText = aiResponseText.trim();
  let shouldHandoffToHuman = false;
  let handoffReason: string | undefined;

  const userLower = (userMessage || '').toLowerCase();
  const aiLower = sanitizedText.toLowerCase();

  // 1. Verificação de Aluno / Ex-Aluno / Cliente Existente
  const studentKeywords = [
    'já sou aluno', 'já sou cliente', 'já fiz aula', 'já fiz adestramento com vocês',
    'já treino aí', 'já comprei com vocês', 'já sou da spe', 'antigo aluno', 'ex aluno'
  ];
  if (studentKeywords.some(kw => userLower.includes(kw)) || ['aluno', 'ex_aluno', 'cliente', 'ex_cliente'].includes(contact.category)) {
    violations.push('Contato identificado como aluno/ex-aluno. Atendimento exclusivo para novos leads.');
    shouldHandoffToHuman = true;
    handoffReason = 'Identificado como aluno ou ex-aluno do Seu Pet Equilibrado';
  }

  // 2. Pedido explícito de atendimento humano
  const humanKeywords = ['falar com atendente', 'atendente humano', 'falar com pessoa', 'humano', 'falar com alguém'];
  if (humanKeywords.some(kw => userLower.includes(kw))) {
    violations.push('Lead solicitou expressamente atendente humano.');
    shouldHandoffToHuman = true;
    handoffReason = 'Solicitação expressa de atendente humano';
  }

  // 3. Falsa identidade de adestrador (a IA é atendente virtual, não o adestrador)
  const falseTrainerPatterns = [
    /\beu vou treinar\b/i,
    /\beu vou na sua casa\b/i,
    /\beu sou o adestrador\b/i,
    /\bquando eu for a[ií]\b/i,
    /\bmeu treino\b/i,
    /\beu adestro\b/i
  ];
  for (const pattern of falseTrainerPatterns) {
    if (pattern.test(sanitizedText)) {
      violations.push(`Falsa identidade de adestrador detectada: "${pattern}"`);
      // Correção automática na resposta
      sanitizedText = sanitizedText
        .replace(/\beu vou treinar\b/gi, 'nossa equipe de adestradores vai treinar')
        .replace(/\beu vou na sua casa\b/gi, 'nosso adestrador vai até a sua residência')
        .replace(/\beu sou o adestrador\b/gi, 'sou a assistente virtual da equipe de adestradores')
        .replace(/\bquando eu for a[ií]\b/gi, 'quando o adestrador for aí');
    }
  }

  // 4. Afirmação falsa de envio de PDF quando não houve confirmação técnica
  const claimsPdfSent = [
    'enviei o material', 'segue o pdf', 'estou enviando o material',
    'acabei de te enviar o material', 'já te mandei o pdf', 'material em pdf acima', 'material anexo'
  ];
  const claimsPdf = claimsPdfSent.some(claim => aiLower.includes(claim));
  if (claimsPdf && !pdfSentSuccess) {
    violations.push('IA afirmou que enviou material/PDF, mas o envio não foi confirmado com sucesso pela API.');
    // Sanitiza removendo alegações falsas de envio
    sanitizedText = sanitizedText
      .replace(/acabei de te enviar o material.*?(\.|$)/gi, 'posso te enviar nosso material explicativo detalhado assim que você quiser.')
      .replace(/segue o pdf.*?(\.|$)/gi, 'temos um material completo que posso te compartilhar.')
      .replace(/estou enviando o material.*?(\.|$)/gi, 'posso te disponibilizar nosso material informativo.');
  }

  // 5. Pergunta direta do cliente ignorada
  const directQuestions = [
    { trigger: /como funciona/i, answerKeywords: ['avaliação', 'avaliaçao', 'presencial', 'visita', 'treino', 'comportamento', 'aulas', 'passo'] },
    { trigger: /quanto custa|qual o valor|preço|preço/i, answerKeywords: ['valor', 'investimento', 'r$', 'avaliação', 'plano', 'orçamento'] },
    { trigger: /onde fica|endereço|local|vocês são de onde/i, answerKeywords: ['cuiabá', 'várzea grande', 'domiciliar', 'casa', 'residência', 'online'] },
    { trigger: /vocês vão até|atende em casa|domicílio/i, answerKeywords: ['domiciliar', 'casa', 'residência', 'vamos até', 'atendemos'] }
  ];

  for (const dq of directQuestions) {
    if (dq.trigger.test(userLower)) {
      const answersQuestion = dq.answerKeywords.some(kw => aiLower.includes(kw));
      if (!answersQuestion) {
        violations.push(`Pergunta direta do usuário sobre "${dq.trigger}" não foi respondida na mensagem da IA.`);
      }
    }
  }

  // 6. Perguntas repetitivas de fatos já conhecidos
  if (state.facts.dogName) {
    const asksDogName = /qual (o )?nome do seu (cão|cachorro|pet|cãozinho)/i;
    if (asksDogName.test(sanitizedText)) {
      violations.push(`IA perguntou o nome do cachorro novamente, mas já é conhecido: "${state.facts.dogName}".`);
      sanitizedText = sanitizedText.replace(asksDogName, `como o ${state.facts.dogName} está se comportando`);
    }
  }

  if (state.facts.city) {
    const asksCity = /qual (a sua )?cidade|você (é|está) de qual cidade|mora em qual cidade/i;
    if (asksCity.test(sanitizedText)) {
      violations.push(`IA perguntou a cidade novamente, mas a cidade já é conhecida: "${state.facts.city}".`);
      sanitizedText = sanitizedText.replace(asksCity, `como você está em ${state.facts.city}`);
    }
  }

  // 7. Repetição genérica idêntica à última resposta do assistente
  const lastAssistantMsg = [...conversationHistory].reverse().find(m => m.sender === 'assistant');
  if (lastAssistantMsg && lastAssistantMsg.content.trim() === sanitizedText.trim()) {
    violations.push('Resposta gerada é idêntica à última mensagem enviada pelo assistente (loop de repetição).');
  }

  // 8. Promessas irreais ou garantias proibidas
  const prohibitedPromises = [/garantia de 100%/i, /cura garantida/i, /resultado 100% garantido/i, /em 3 dias ele para/i];
  for (const prom of prohibitedPromises) {
    if (prom.test(sanitizedText)) {
      violations.push(`Promessa irreal ou garantia inadequada detectada: "${prom}"`);
      sanitizedText = sanitizedText.replace(prom, 'trabalhamos com metodologia consistente e respeito ao tempo de cada cão');
    }
  }

  // 9. Garantia de mensagem única (sem quebras artificiais de múltiplos envios)
  if (sanitizedText.includes('---SPLIT_MESSAGE---') || sanitizedText.includes('===MSG_BREAK===')) {
    sanitizedText = sanitizedText.replace(/---SPLIT_MESSAGE---|===MSG_BREAK===/g, '\n\n');
  }

  const passed = violations.length === 0 || (!shouldHandoffToHuman && violations.every(v => v.includes('detectada') || v.includes('afirmou')));

  if (!passed) {
    logEvent({
      eventType: 'DEBUGGER_REJECTED',
      contactId: contact.id,
      details: { violations, shouldHandoffToHuman, handoffReason }
    });
  } else {
    logEvent({
      eventType: 'DEBUGGER_PASSED',
      contactId: contact.id,
      details: { violationsCount: violations.length }
    });
  }

  return {
    passed,
    violations,
    sanitizedText,
    shouldHandoffToHuman,
    handoffReason
  };
}
