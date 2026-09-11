import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const search = searchParams.get("search");

    const where: any = {};
    if (status) {
      where.status = status;
    }
    if (search) {
      where.OR = [
        { name: { contains: search } },
        { phone: { contains: search } },
        { dog_name: { contains: search } },
      ];
    }

    const contacts = await prisma.contact.findMany({
      where,
      include: {
        conversations: {
          orderBy: { updated_at: "desc" },
          take: 1,
        },
        lead_data: true,
      },
      orderBy: { updated_at: "desc" },
    });

    return NextResponse.json({ success: true, contacts });
  } catch (error) {
    logger.error("Erro ao listar contatos", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
