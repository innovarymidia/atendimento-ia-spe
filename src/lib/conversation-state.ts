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
  ultima_pergunta_cliente: string | null;
  aguardando_resposta: boolean;
  material_enviado: boolean;
  duvidas_respondidas: string[];
  perguntas_feitas: string[];
  lastUpdated: string;
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

  return {
    lead_status: state.lead_status || (contact?.category === 'aluno' ? 'aluno' : contact?.category === 'ex_aluno' ? 'ex_aluno' : 'novo'),
    nome: state.nome || contact?.name || null,
    cidade: state.cidade || facts.city || null,
    interesse: state.interesse || null,
    problema: state.problema || facts.dogProblem || null,
    tipo_atendimento: state.tipo_atendimento || (contact?.modality?.toLowerCase().includes('presencial') ? 'presencial_joao' : contact?.modality?.toLowerCase().includes('online') ? 'online_nicolle' : null),
    etapa: stage,
    facts,
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
