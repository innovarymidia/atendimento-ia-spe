import { NextRequest, NextResponse } from "next/server";
import { MessageDirection, ProcessingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { extractEvolutionMessage } from "@/lib/schemas/evolution.schema";
import { ConversationService } from "@/lib/services/conversation.service";
import { BufferService } from "@/lib/services/buffer.service";
import { ensureSystemDefaults } from "@/lib/services/system-init.service";

export async function POST(req: NextRequest) {
  try {
    // Garantir que AiConfig e Settings padrão existam
    await ensureSystemDefaults();

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    logger.info("webhook recebido", { event: body?.event || body?.type });

    // 1. Validar e extrair dados da mensagem
    const extracted = extractEvolutionMessage(body);
    if (!extracted) {
      logger.info("mensagem ignorada", { reason: "Evento não é uma mensagem válida" });
      return NextResponse.json({ ignored: true, reason: "not_a_message_event" });
    }

    // 2. Regra #5: Ignorar grupos
    if (extracted.isGroup) {
      logger.info("mensagem ignorada", {
        reason: "Mensagem originada de grupo",
        messageId: extracted.messageId,
      });
      return NextResponse.json({ ignored: true, reason: "group_ignored" });
    }

    // 3. Regra #6: Ignorar mensagens do próprio bot (evitar loops)
    if (extracted.fromMe) {
      logger.info("mensagem ignorada", {
        reason: "Mensagem enviada pelo próprio bot (fromMe)",
        messageId: extracted.messageId,
      });
      return NextResponse.json({ ignored: true, reason: "from_me_ignored" });
    }

    // 4. Regra de conteúdo vazio
    if (!extracted.content) {
      logger.info("mensagem ignorada", {
        reason: "Mensagem sem conteúdo textual ou mídia não suportada",
        messageId: extracted.messageId,
      });
      return NextResponse.json({ ignored: true, reason: "empty_content" });
    }

    // 5. Regra #4: Idempotência (verificar se ID único já existe)
    const existingMessage = await prisma.message.findUnique({
      where: { external_message_id: extracted.messageId },
    });

    if (existingMessage) {
      logger.warn("mensagem duplicada", {
        messageId: extracted.messageId,
        phone: extracted.phone,
      });
      return NextResponse.json({
        ignored: true,
        reason: "duplicate_message",
        messageId: extracted.messageId,
      });
    }

    // 6. Identificar ou criar contato e conversa
    const { contact, conversation } =
      await ConversationService.getOrCreateContactAndConversation(
        extracted.phone,
        extracted.pushName
      );

    // 7. Salvar a mensagem recebida no banco com status PENDING
    const savedMessage = await prisma.message.create({
      data: {
        conversation_id: conversation.id,
        contact_id: contact.id,
        external_message_id: extracted.messageId,
        direction: MessageDirection.INCOMING,
        message_type: extracted.messageType,
        content: extracted.content,
        ai_generated: false,
        processing_status: ProcessingStatus.PENDING,
      },
    });

    logger.info("mensagem recebida", {
      messageId: savedMessage.id,
      externalId: extracted.messageId,
      phone: contact.phone,
      contactStatus: contact.status,
    });

    // 8. Encaminhar para o Buffer assíncrono (não bloqueia o webhook)
    await BufferService.addMessage(conversation.id, savedMessage.id);

    // 9. Resposta rápida para a Evolution API
    return NextResponse.json({
      success: true,
      queued: true,
      messageId: savedMessage.id,
      contactId: contact.id,
      conversationId: conversation.id,
    });
  } catch (error) {
    logger.error("Erro interno ao processar webhook Evolution", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
