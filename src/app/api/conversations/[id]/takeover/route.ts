import { NextRequest, NextResponse } from "next/server";
import { ConversationService } from "@/lib/services/conversation.service";
import { logger } from "@/lib/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const reason = body?.reason || "MANUAL_TAKEOVER";

    const updated = await ConversationService.takeoverConversation(id, reason);

    logger.info("transferência para humano", { conversationId: id, reason });

    return NextResponse.json({
      success: true,
      conversation: updated,
      message: "Atendimento assumido pelo atendente. IA silenciada.",
    });
  } catch (error) {
    logger.error("Erro ao assumir atendimento", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
