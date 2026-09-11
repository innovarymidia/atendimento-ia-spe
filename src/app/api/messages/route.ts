import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get("conversationId");
    const contactId = searchParams.get("contactId");
    const limit = Number(searchParams.get("limit") || 50);

    const where: any = {};
    if (conversationId) where.conversation_id = conversationId;
    if (contactId) where.contact_id = contactId;

    const messages = await prisma.message.findMany({
      where,
      orderBy: { created_at: "desc" },
      take: limit,
      include: {
        contact: {
          select: { phone: true, name: true },
        },
      },
    });

    return NextResponse.json({ success: true, messages: messages.reverse() });
  } catch (error) {
    logger.error("Erro ao listar mensagens", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
