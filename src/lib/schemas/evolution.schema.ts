import { z } from "zod";

export interface ExtractedWebhookMessage {
  messageId: string;
  phone: string;
  pushName?: string;
  fromMe: boolean;
  isGroup: boolean;
  content: string;
  messageType: string;
  timestamp?: number;
}

export function extractEvolutionMessage(body: any): ExtractedWebhookMessage | null {
  if (!body || typeof body !== "object") return null;

  // Normalização do evento
  const event = body.event || body.type;
  if (event && !event.includes("message") && !event.includes("MESSAGE")) {
    return null;
  }

  // Obter o objeto da mensagem (pode estar em body.data ou body.data.messages[0])
  let data = body.data;
  if (Array.isArray(data)) {
    data = data[0];
  } else if (data?.messages && Array.isArray(data.messages)) {
    data = data.messages[0];
  }

  if (!data || !data.key) return null;

  const key = data.key;
  const messageId = key.id;
  const remoteJid = key.remoteJid || "";
  const fromMe = Boolean(key.fromMe);
  const isGroup = remoteJid.endsWith("@g.us") || Boolean(data.isGroup);

  if (!messageId || !remoteJid) return null;

  // Extrair número de telefone limpo
  const phone = remoteJid.replace(/@.*$/, "").replace(/\D/g, "");
  const pushName = data.pushName || undefined;

  // Extrair texto do payload da mensagem
  const messageObj = data.message || {};
  let content = "";
  let messageType = "text";

  if (typeof messageObj.conversation === "string") {
    content = messageObj.conversation;
  } else if (typeof messageObj.extendedTextMessage?.text === "string") {
    content = messageObj.extendedTextMessage.text;
  } else if (messageObj.audioMessage) {
    messageType = "audio";
    content = "[Áudio recebido]";
  } else if (messageObj.imageMessage) {
    messageType = "image";
    content = messageObj.imageMessage.caption || "[Imagem recebida]";
  } else if (messageObj.documentMessage) {
    messageType = "document";
    content = messageObj.documentMessage.title || "[Documento recebido]";
  } else if (typeof data.text === "string") {
    content = data.text;
  }

  return {
    messageId,
    phone,
    pushName,
    fromMe,
    isGroup,
    content: content.trim(),
    messageType,
    timestamp: data.messageTimestamp ? Number(data.messageTimestamp) * 1000 : Date.now(),
  };
}
