import { Contact, queryOne, queryAll, executeRun } from './db';
import { cleanPhoneNumber, getPhoneSearchVariants } from './phone';

export interface GuardrailCheckResult {
  allowed: boolean;
  reason: string;
  contact: Contact;
}

// Categorias expressamente proibidas de receber resposta da IA
export const FORBIDDEN_CATEGORIES = new Set([
  'aluno',
  'ex_aluno',
  'cliente',
  'ex_cliente',
  'equipe',
  'parceiro',
  'fornecedor',
  'pessoal',
  'nao_responder',
  'bloqueado'
]);

// Status de atendimento em que a IA NÃO pode intervir
export const FORBIDDEN_STATUSES = new Set([
  'aguardando_humano',
  'atendimento_humano',
  'cliente',
  'ex_cliente',
  'nao_atender',
  'bloqueado'
]);

/**
 * Busca ou cria o contato com segurança e tolerância ao 9º dígito (Postgres & SQLite).
 */
export async function findOrCreateContact(rawPhone: string, rawName?: string): Promise<Contact> {
  const cleaned = cleanPhoneNumber(rawPhone);
  const variants = getPhoneSearchVariants(cleaned);

  const placeholders = variants.map(() => '?').join(',');
  let contact = await queryOne<Contact>(`
    SELECT * FROM contacts WHERE phone IN (${placeholders}) LIMIT 1
  `, variants);

  if (!contact) {
    const insertRes = await executeRun(`
      INSERT INTO contacts (
        phone, name, category, status, aiActive, blocked, step, stage, lastInteractionAt
      ) VALUES (?, ?, 'novo_lead', 'novo_lead', 1, 0, 'novo_lead', 'NOVO_LEAD', CURRENT_TIMESTAMP)
    `, [cleaned, rawName || null]);

    const newId = insertRes.lastInsertRowid;
    if (newId) {
      contact = await queryOne<Contact>('SELECT * FROM contacts WHERE id = ?', [newId]);
    } else {
      contact = await queryOne<Contact>('SELECT * FROM contacts WHERE phone = ?', [cleaned]);
    }
  } else if (rawName && (!contact.name || contact.name === 'Desconhecido')) {
    await executeRun(`UPDATE contacts SET name = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?`, [rawName, contact.id]);
    contact.name = rawName;
  }

  return contact!;
}

/**
 * Camada de controle determinística rigorosa executada ANTES da IA.
 * Nenhuma chamada de IA pode ser executada se esta função retornar allowed: false.
 */
export async function evaluateGuardrail(contact: Contact): Promise<GuardrailCheckResult> {
  // 1. Verificar se a IA Global está ativada no sistema
  const globalSetting = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'globalAiEnabled'");
  if (globalSetting && globalSetting.value === 'false') {
    return {
      allowed: false,
      reason: 'IA desativada globalmente no sistema.',
      contact
    };
  }

  // 2. Verificar se o número está explicitamente bloqueado
  if (contact.blocked === 1) {
    return {
      allowed: false,
      reason: 'Contato está na lista de bloqueio.',
      contact
    };
  }

  // 3. Verificar categoria excluída da IA
  const cat = (contact.category || '').toLowerCase().trim();
  if (FORBIDDEN_CATEGORIES.has(cat)) {
    return {
      allowed: false,
      reason: `Contato pertence à categoria restrita: "${contact.category}".`,
      contact
    };
  }

  // 4. Verificar se o status atual impede intervenção da IA
  const st = (contact.status || '').toLowerCase().trim();
  if (FORBIDDEN_STATUSES.has(st)) {
    return {
      allowed: false,
      reason: `Contato com status que exige silêncio da IA: "${contact.status}".`,
      contact
    };
  }

  // 5. Verificar se a flag aiActive está desligada para este contato
  if (contact.aiActive === 0) {
    return {
      allowed: false,
      reason: 'IA está desativada especificamente para este contato (aiActive = false).',
      contact
    };
  }

  // 6. Verificar se já concluiu o envio do PDF e foi transferido
  if (contact.pdfSent === 1 && contact.status !== 'em_atendimento_ia') {
    return {
      allowed: false,
      reason: 'Material já foi enviado e contato transferido para humano.',
      contact
    };
  }

  return {
    allowed: true,
    reason: 'Contato autorizado para atendimento pela IA.',
    contact
  };
}

/**
 * João ou Nicolle assumem o atendimento manualmente:
 * Desativa a IA imediatamente e define status como atendimento_humano
 */
export async function assumeAttendance(contactId: number): Promise<void> {
  await executeRun(`
    UPDATE contacts 
    SET aiActive = 0, 
        status = 'atendimento_humano', 
        updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [contactId]);
}

/**
 * Operador devolve a conversa para a IA
 */
export async function returnToAi(contactId: number): Promise<void> {
  await executeRun(`
    UPDATE contacts 
    SET aiActive = 1, 
        status = 'em_atendimento_ia', 
        updatedAt = CURRENT_TIMESTAMP
    WHERE id = ?
  `, [contactId]);
}
