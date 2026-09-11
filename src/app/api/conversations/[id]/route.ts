import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const conversation = await prisma.conversation.findUnique({
      where: { id },
      include: {
        contact: {
          include: { lead_data: true },
        },
        messages: {
          orderBy: { created_at: "asc" },
        },
        buffer_items: true,
      },
    });

    if (!conversation) {
      return NextResponse.json({ error: "Conversation not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, conversation });
  } catch (error) {
    logger.error("Erro ao buscar detalhes da conversa", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
