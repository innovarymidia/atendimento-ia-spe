import { getDb, Contact } from './db';
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
 * Busca ou cria o contato com segurança e tolerância ao 9º dígito.
 */
export function findOrCreateContact(rawPhone: string, rawName?: string): Contact {
  const db = getDb();
  const cleaned = cleanPhoneNumber(rawPhone);
  const variants = getPhoneSearchVariants(cleaned);

  // Buscar por qualquer variante do número (com ou sem o 9º dígito)
  const placeholders = variants.map(() => '?').join(',');
  const findStmt = db.prepare(`
    SELECT * FROM contacts WHERE phone IN (${placeholders}) LIMIT 1
  `);
  
  let contact = findStmt.get(...variants) as Contact | undefined;

  if (!contact) {
    // Criar como novo lead padrão
    const insertStmt = db.prepare(`
      INSERT INTO contacts (
        phone, name, category, status, aiActive, blocked, step, lastInteractionAt
      ) VALUES (?, ?, 'novo_lead', 'novo_lead', 1, 0, 'novo_lead', datetime('now', 'localtime'))
    `);
    const info = insertStmt.run(cleaned, rawName || null);
    
    contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(info.lastInsertRowid) as Contact;
  } else if (rawName && (!contact.name || contact.name === 'Desconhecido')) {
    // Atualizar nome se recebido e ainda não preenchido
    db.prepare(`UPDATE contacts SET name = ?, updatedAt = datetime('now', 'localtime') WHERE id = ?`).run(rawName, contact.id);
    contact.name = rawName;
  }

  return contact;
}

/**
 * Camada de controle determinística rigorosa executada ANTES da IA.
 * Nenhuma chamada de IA pode ser executada se esta função retornar allowed: false.
 */
export function evaluateGuardrail(contact: Contact): GuardrailCheckResult {
  const db = getDb();

  // 1. Verificar se a IA Global está ativada no sistema
  const globalSetting = db.prepare("SELECT value FROM settings WHERE key = 'globalAiEnabled'").get() as { value: string } | undefined;
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

  // Passou por todos os testes determinísticos
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
export function assumeAttendance(contactId: number): void {
  const db = getDb();
  db.prepare(`
    UPDATE contacts 
    SET aiActive = 0, 
        status = 'atendimento_humano', 
        updatedAt = datetime('now', 'localtime')
    WHERE id = ?
  `).run(contactId);
}

/**
 * Operador devolve a conversa para a IA
 */
export function returnToAi(contactId: number): void {
  const db = getDb();
  db.prepare(`
    UPDATE contacts 
    SET aiActive = 1, 
        status = 'em_atendimento_ia', 
        updatedAt = datetime('now', 'localtime')
    WHERE id = ?
  `).run(contactId);
}
