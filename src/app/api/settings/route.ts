import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET() {
  try {
    const settings = await prisma.settings.findMany();
    const settingsMap: Record<string, string> = {};
    for (const s of settings) {
      settingsMap[s.key] = s.value;
    }
    return NextResponse.json({ success: true, settings: settingsMap });
  } catch (error) {
    logger.error("Erro ao listar configurações", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.key && body.value !== undefined) {
      const updated = await prisma.settings.upsert({
        where: { key: body.key },
        create: { key: body.key, value: String(body.value) },
        update: { value: String(body.value) },
      });
      return NextResponse.json({ success: true, setting: updated });
    }

    if (body.settings && typeof body.settings === "object") {
      const results: any[] = [];
      for (const [key, val] of Object.entries(body.settings)) {
        const item = await prisma.settings.upsert({
          where: { key },
          create: { key, value: String(val) },
          update: { value: String(val) },
        });
        results.push(item);
      }
      return NextResponse.json({ success: true, updated: results });
    }

    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  } catch (error) {
    logger.error("Erro ao atualizar configurações", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
