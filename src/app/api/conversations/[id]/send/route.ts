import { NextRequest, NextResponse } from "next/server";
import { ConversationStatus, MessageDirection, ProcessingStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { EvolutionService } from "@/lib/services/evolution.service";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    if (!body?.text || typeof body.text !== "string" || !body.text.trim()) {
      return NextResponse.json({ error: "Text is required" }, { status: 400 });
    }

    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: { contact: true },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    const text = body.text.trim();

    // 1. Enviar mensagem via Evolution API
    const sendResult = await EvolutionService.sendTextMessage(conversation.contact.phone, text);

    if (!sendResult.success) {
      return NextResponse.json(
        { error: `Evolution API Error: ${sendResult.error}` },
        { status: 502 }
      );
    }

    // 2. Gravar no banco de dados como mensagem manual do atendente
    const savedMessage = await prisma.message.create({
      data: {
        conversation_id: conversation.id,
        contact_id: conversation.contact_id,
        external_message_id: sendResult.messageId || null,
        direction: MessageDirection.OUTGOING,
        message_type: "text",
        content: text,
        ai_generated: false,
        processing_status: ProcessingStatus.PROCESSED,
      },
    });

    // 3. Garantir que a conversa esteja em HUMAN_ACTIVE se o atendente humano enviou mensagem
    if (conversation.status !== ConversationStatus.HUMAN_ACTIVE) {
      await prisma.conversation.update({
        where: { id: conversation.id },
        data: {
          status: ConversationStatus.HUMAN_ACTIVE,
          transfer_reason: "HUMAN_AGENT_REPLIED",
        },
      });
      await prisma.contact.update({
        where: { id: conversation.contact_id },
        data: { automatic_service_enabled: false },
      });
      logger.info("Conversa alterada para HUMAN_ACTIVE devido a envio manual de atendente", {
        conversationId: conversation.id,
      });
    }

    return NextResponse.json({
      success: true,
      message: savedMessage,
    });
  } catch (error) {
    logger.error("Erro ao enviar mensagem manual", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
