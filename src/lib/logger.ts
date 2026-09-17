export type LogEventType =
  | 'MESSAGE_RECEIVED'
  | 'BUFFER_QUEUED'
  | 'BUFFER_SILENCE_MET'
  | 'BUFFER_EXTENDED'
  | 'LOCK_ACQUIRED'
  | 'LOCK_REJECTED'
  | 'LOCK_RELEASED'
  | 'GUARDRAIL_BLOCKED'
  | 'STATE_LOADED'
  | 'STATE_UPDATED'
  | 'GEMINI_PROMPT'
  | 'GEMINI_RESPONSE'
  | 'DEBUGGER_PASSED'
  | 'DEBUGGER_REJECTED'
  | 'HUMAN_DELAY_STARTED'
  | 'HUMAN_DELAY_CANCELLED'
  | 'EVOLUTION_SEND_START'
  | 'EVOLUTION_SEND_SUCCESS'
  | 'EVOLUTION_SEND_ERROR'
  | 'PDF_VALIDATION_ERROR'
  | 'ERROR';

export interface StructuredLog {
  timestamp: string;
  contactId?: number;
  phone?: string;
  event: LogEventType;
  details?: any;
}

export class Logger {
  static log(event: LogEventType, payload?: { contactId?: number; phone?: string; details?: any }) {
    const entry: StructuredLog = {
      timestamp: new Date().toISOString(),
      contactId: payload?.contactId,
      phone: payload?.phone,
      event,
      details: payload?.details
    };

    const detailsStr = entry.details ? ` | ${JSON.stringify(entry.details)}` : '';
    const phoneStr = entry.phone ? ` [${entry.phone}]` : entry.contactId ? ` [ID:${entry.contactId}]` : '';
    console.log(`[SPE_AUDIT] ${entry.timestamp}${phoneStr} ${event}${detailsStr}`);
  }

  static error(event: LogEventType, error: any, payload?: { contactId?: number; phone?: string }) {
    const entry: StructuredLog = {
      timestamp: new Date().toISOString(),
      contactId: payload?.contactId,
      phone: payload?.phone,
      event,
      details: {
        message: error?.message || String(error),
        stack: error?.stack,
        response: error?.response?.data
      }
    };
    console.error(`[SPE_ERROR] ${entry.timestamp} ${event}:`, entry.details);
  }
}

export function logEvent(params: {
  eventType: string;
  contactId?: number;
  contactPhone?: string;
  phone?: string;
  details?: any;
}) {
  Logger.log(params.eventType as any, {
    contactId: params.contactId,
    phone: params.contactPhone || params.phone,
    details: params.details
  });
}

