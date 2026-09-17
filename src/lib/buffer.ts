import { executeRun, queryOne, queryAll, Contact, Message } from './db';
import { logEvent } from './logger';

export const BUFFER_WINDOW_MS = 5000;
export const HUMAN_DELAY_MIN_MS = 2000;
export const HUMAN_DELAY_MAX_MS = 4000;
export const LOCK_EXPIRATION_MS = 60000; // 60 segundos de segurança contra crash

interface BufferState {
  timer: NodeJS.Timeout | null;
  lastMessageTime: number;
}

// Map em memória para debounce de buffers ativos
const bufferTimers = new Map<number, BufferState>();

// Map em memória para tokens de cancelamento de envio durante delay humano
const pendingSendTimeouts = new Map<number, NodeJS.Timeout>();

// In-memory locks como redundância rápida para lock em banco
const memoryLocks = new Map<number, number>();

/**
 * Registra ou cancela envio pendente durante delay humano.
 * Se o cliente enviar uma nova mensagem durante o delay, a resposta anterior é abortada.
 */
export function cancelPendingSend(contactId: number): boolean {
  const existing = pendingSendTimeouts.get(contactId);
  if (existing) {
    clearTimeout(existing);
    pendingSendTimeouts.delete(contactId);
    logEvent({
      eventType: 'DELAY_CANCELLED',
      contactId,
      details: { reason: 'Nova mensagem recebida durante delay humano' }
    });
    return true;
  }
  return false;
}

export function registerPendingSend(contactId: number, timeout: NodeJS.Timeout) {
  cancelPendingSend(contactId);
  pendingSendTimeouts.set(contactId, timeout);
}

export function clearPendingSend(contactId: number) {
  pendingSendTimeouts.delete(contactId);
}

/**
 * Adquire lock de concorrência para o contato (DB + Memória)
 */
export async function acquireLock(contactId: number): Promise<boolean> {
  const now = Date.now();

  // Verifica lock em memória
  const memLockUntil = memoryLocks.get(contactId);
  if (memLockUntil && memLockUntil > now) {
    return false;
  }

  // Verifica lock no banco de dados
  const contact = await queryOne<Contact>(
    'SELECT id, processingLockUntil FROM contacts WHERE id = ?',
    [contactId]
  );

  if (contact?.processingLockUntil) {
    const lockTime = new Date(contact.processingLockUntil).getTime();
    if (lockTime > now) {
      logEvent({
        eventType: 'CONCURRENCY_BLOCKED',
        contactId,
        details: { lockUntil: contact.processingLockUntil }
      });
      return false;
    }
  }

  const lockUntilDate = new Date(now + LOCK_EXPIRATION_MS).toISOString();
  memoryLocks.set(contactId, now + LOCK_EXPIRATION_MS);

  await executeRun(
    'UPDATE contacts SET processingLockUntil = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
    [lockUntilDate, contactId]
  );

  logEvent({
    eventType: 'LOCK_ACQUIRED',
    contactId,
    details: { lockUntil: lockUntilDate }
  });

  return true;
}

/**
 * Libera lock de concorrência para o contato
 */
export async function releaseLock(contactId: number): Promise<void> {
  memoryLocks.delete(contactId);
  try {
    await executeRun(
      'UPDATE contacts SET processingLockUntil = NULL, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
      [contactId]
    );
    logEvent({
      eventType: 'LOCK_RELEASED',
      contactId
    });
  } catch (err: any) {
    console.warn(`[Buffer] Erro ao liberar lock para contato ${contactId}:`, err.message);
  }
}

/**
 * Agenda o processamento com buffer de silêncio (5 segundos).
 * Se novas mensagens chegarem, o timer é estendido.
 */
export function scheduleBufferProcessing(
  contactId: number,
  onFlush: (contactId: number) => Promise<void>
): void {
  // Se havia um envio agendado em delay, cancela para incluir a nova mensagem
  cancelPendingSend(contactId);

  const existing = bufferTimers.get(contactId);
  if (existing?.timer) {
    clearTimeout(existing.timer);
    logEvent({
      eventType: 'BUFFER_EXTENDED',
      contactId,
      details: { addedWindowMs: BUFFER_WINDOW_MS }
    });
  } else {
    logEvent({
      eventType: 'BUFFER_QUEUED',
      contactId,
      details: { windowMs: BUFFER_WINDOW_MS }
    });
  }

  const timer = setTimeout(async () => {
    bufferTimers.delete(contactId);
    logEvent({
      eventType: 'BUFFER_FLUSHED',
      contactId
    });

    try {
      await onFlush(contactId);
    } catch (err: any) {
      console.error(`[Buffer] Erro ao processar buffer para contato ${contactId}:`, err);
    }
  }, BUFFER_WINDOW_MS);

  bufferTimers.set(contactId, {
    timer,
    lastMessageTime: Date.now()
  });
}

/**
 * Busca todas as mensagens pendentes (não processadas) de um contato e as consolida.
 */
export async function getUnprocessedMessages(contactId: number): Promise<Message[]> {
  return await queryAll<Message>(
    'SELECT * FROM messages WHERE contactId = ? AND isProcessed = 0 AND sender = ? ORDER BY id ASC',
    [contactId, 'user']
  );
}

/**
 * Marca as mensagens de um contato como processadas.
 */
export async function markMessagesAsProcessed(messageIds: number[]): Promise<void> {
  if (!messageIds || messageIds.length === 0) return;
  const placeholders = messageIds.map(() => '?').join(',');
  await executeRun(
    `UPDATE messages SET isProcessed = 1 WHERE id IN (${placeholders})`,
    messageIds
  );
}

/**
 * Calcula delay humano aleatório entre 2000ms e 4000ms
 */
export function getHumanDelayMs(): number {
  return Math.floor(
    Math.random() * (HUMAN_DELAY_MAX_MS - HUMAN_DELAY_MIN_MS + 1) + HUMAN_DELAY_MIN_MS
  );
}
