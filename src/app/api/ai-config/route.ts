import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { ensureSystemDefaults } from "@/lib/services/system-init.service";

export async function GET() {
  try {
    await ensureSystemDefaults();
    const config = await prisma.aiConfig.findFirst({
      where: { active: true },
    });
    return NextResponse.json({ success: true, config });
  } catch (error) {
    logger.error("Erro ao buscar configuração da IA", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    await ensureSystemDefaults();
    const body = await req.json();

    const existingConfig = await prisma.aiConfig.findFirst({
      where: { active: true },
    });

    const updateData: any = {};
    if (body.system_prompt !== undefined) updateData.system_prompt = body.system_prompt;
    if (body.model !== undefined) updateData.model = body.model;
    if (body.temperature !== undefined) updateData.temperature = Number(body.temperature);
    if (body.max_tokens !== undefined) updateData.max_tokens = Number(body.max_tokens);

    let updated;
    if (existingConfig) {
      updated = await prisma.aiConfig.update({
        where: { id: existingConfig.id },
        data: updateData,
      });
    } else {
      updated = await prisma.aiConfig.create({
        data: {
          system_prompt: body.system_prompt || "Assistente de adestramento",
          model: body.model || "gemini-2.5-flash",
          temperature: Number(body.temperature || 0.7),
          max_tokens: Number(body.max_tokens || 800),
          active: true,
        },
      });
    }

    logger.info("Configuração da IA atualizada", { configId: updated.id });
    return NextResponse.json({ success: true, config: updated });
  } catch (error) {
    logger.error("Erro ao atualizar configuração da IA", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
