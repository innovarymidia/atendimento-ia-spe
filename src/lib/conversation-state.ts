import { Contact } from './db';

export type AttendanceStage =
  | 'NOVO_LEAD'
  | 'SAUDACAO'
  | 'IDENTIFICACAO_DA_NECESSIDADE'
  | 'COLETA_DE_INFORMACOES'
  | 'IDENTIFICACAO_DA_CIDADE'
  | 'EXPLICACAO_DO_ATENDIMENTO'
  | 'APRESENTACAO_DA_AVALIACAO'
  | 'APRESENTACAO_DE_VALORES_MATERIAL'
  | 'INTERESSE_EM_AGENDAR'
  | 'AGENDAMENTO'
  | 'HUMANO';

export interface ConversationFacts {
  dogName: string | null;
  dogBreed: string | null;
  dogAge: string | null;
  dogProblem: string | null;
  city: string | null;
}

export interface ConversationState {
  lead_status: 'novo' | 'qualificado' | 'aluno' | 'ex_aluno' | 'bloqueado' | 'humano';
  nome: string | null;
  cidade: string | null;
  interesse: string | null;
  problema: string | null;
  tipo_atendimento: 'presencial_joao' | 'online_nicolle' | null;
  etapa: AttendanceStage;
  facts: ConversationFacts;
  caso_minimamente_compreendido: boolean;
  avaliacao_apresentada: boolean;
  pdf_permitido: boolean;
  ultima_pergunta_cliente: string | null;
  aguardando_resposta: boolean;
  material_enviado: boolean;
  duvidas_respondidas: string[];
  perguntas_feitas: string[];
  lastUpdated: string;
}

/**
 * Avalia se o caso já foi minimamente compreendido pelo relato concreto do tutor.
 * Evita que expressões vagas ("coisas de filhote", "ele é difícil", "quero adestrar")
 * sejam consideradas caso compreendido prematuramente.
 */
export function evaluateCaseUnderstanding(
  state: ConversationState,
  incomingMessage: string,
  _history: any[] = []
): boolean {
  if (state.caso_minimamente_compreendido) return true;

  const combined = `${state.problema || ''} ${state.facts.dogProblem || ''} ${incomingMessage || ''}`.toLowerCase();

  // Expressões vagas que NÃO qualificam caso compreendido por si sós
  const vagueExpressions = [
    /^\s*(coisas? de filhote|ele é filhote|problemas de filhote)\s*$/i,
    /^\s*(ele é difícil|muito difícil|complicado)\s*$/i,
    /^\s*(quero adestrar|preciso de adestramento|ajustar coisas?)\s*$/i,
    /^\s*(problemas de comportamento|comportamento)\s*$/i
  ];

  const isOnlyVague = vagueExpressions.some(ve => ve.test(combined.trim()));
  if (isOnlyVague) return false;

  // Comportamentos e queixas concretas relatadas
  const concreteBehaviorKeywords = [
    'morde', 'mordendo', 'mordida', 'xixi', 'cocô', 'coco', 'sanitári', 'late', 'latindo', 'latido',
    'destrói', 'destruindo', 'destruição', 'pula', 'pulando', 'pulo', 'puxa', 'puxando', 'passeio',
    'agressiv', 'rosna', 'rosnando', 'medo', 'agitado', 'agitação', 'chorando', 'ansiedade',
    'separação', 'briga', 'ciúme', 'guarda', 'socializa', 'obediência', 'comida', 'posse', 'reag'
  ];

  const hasConcreteKeyword = concreteBehaviorKeywords.some(kw => combined.includes(kw));
  if (hasConcreteKeyword) return true;

  // Se o problema relatado tiver substância real (> 25 caracteres descritivos sem ser só cidade/nome)
  const cleanDesc = combined
    .replace(/cuiabá|cuiaba|várzea grande|varzea grande|srd|filhote|anos?|meses?/gi, '')
    .trim();

  return cleanDesc.length >= 25;
}

/**
 * Trava estrutural no código: o envio do PDF só é permitido quando houver
 * solicitação expressa ou confirmação positiva do tutor.
 */
export function isPdfExplicitlyAllowed(
  incomingMessage: string,
  _history: any[] = [],
  currentState?: ConversationState
): boolean {
  if (currentState?.pdf_permitido) return true;

  const msg = (incomingMessage || '').trim().toLowerCase();

  // Solicitação direta de material ou valores
  const directPdfRequest = /\b(manda|mande|envia|enviar|mandar|pdf|material|tabela|preço|precos|preco|preços|valores|quanto custa|qual o valor|investimento)\b/i;
  if (directPdfRequest.test(msg)) return true;

  // Confirmação afirmativa do tutor
  const affirmativeConfirm = /^(sim|pode|pode ser|com certeza|quero|quero sim|manda sim|por favor|claro|manda ver|pode mandar|pode enviar|gostaria|tenho interesse|mande|ok pode|pode sim|sim por favor)$/i;
  if (affirmativeConfirm.test(msg)) return true;

  return false;
}

export function parseConversationState(raw: string | null | undefined, contact?: Contact): ConversationState {
  let state: Partial<ConversationState> = {};
  if (raw) {
    try {
      state = JSON.parse(raw);
    } catch {
      state = {};
    }
  }

  const stage = (state.etapa || (contact?.stage as AttendanceStage) || 'NOVO_LEAD') as AttendanceStage;

  const facts: ConversationFacts = {
    dogName: state.facts?.dogName || contact?.dogName || null,
    dogBreed: state.facts?.dogBreed || contact?.dogBreed || null,
    dogAge: state.facts?.dogAge || contact?.dogAge || null,
    dogProblem: state.facts?.dogProblem || contact?.behaviorSummary || null,
    city: state.facts?.city || contact?.city || null
  };

  const initialProblem = state.problema || facts.dogProblem || null;
  const initialCaseUnderstood = Boolean(state.caso_minimamente_compreendido || (initialProblem && initialProblem.length > 20));

  return {
    lead_status: state.lead_status || (contact?.category === 'aluno' ? 'aluno' : contact?.category === 'ex_aluno' ? 'ex_aluno' : 'novo'),
    nome: state.nome || contact?.name || null,
    cidade: state.cidade || facts.city || null,
    interesse: state.interesse || null,
    problema: initialProblem,
    tipo_atendimento: state.tipo_atendimento || (contact?.modality?.toLowerCase().includes('presencial') ? 'presencial_joao' : contact?.modality?.toLowerCase().includes('online') ? 'online_nicolle' : null),
    etapa: stage,
    facts,
    caso_minimamente_compreendido: initialCaseUnderstood,
    avaliacao_apresentada: state.avaliacao_apresentada ?? false,
    pdf_permitido: state.pdf_permitido ?? false,
    ultima_pergunta_cliente: state.ultima_pergunta_cliente || null,
    aguardando_resposta: state.aguardando_resposta ?? true,
    material_enviado: state.material_enviado ?? Boolean(contact?.pdfSent),
    duvidas_respondidas: Array.isArray(state.duvidas_respondidas) ? state.duvidas_respondidas : [],
    perguntas_feitas: Array.isArray(state.perguntas_feitas) ? state.perguntas_feitas : [],
    lastUpdated: state.lastUpdated || new Date().toISOString()
  };
}

export function serializeConversationState(state: ConversationState): string {
  return JSON.stringify({
    ...state,
    lastUpdated: new Date().toISOString()
  });
}
