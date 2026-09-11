import { NextRequest, NextResponse } from "next/server";
import { ConversationService } from "@/lib/services/conversation.service";
import { logger } from "@/lib/logger";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updated = await ConversationService.returnToAi(id);

    logger.info("Conversa devolvida para IA", { conversationId: id });

    return NextResponse.json({
      success: true,
      conversation: updated,
      message: "Atendimento devolvido para a IA.",
    });
  } catch (error) {
    logger.error("Erro ao devolver atendimento para IA", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
