import { NextRequest, NextResponse } from "next/server";
import { ContactStatus } from "@prisma/client";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contact = await prisma.contact.findUnique({
      where: { id },
      include: {
        conversations: {
          orderBy: { updated_at: "desc" },
        },
        lead_data: true,
      },
    });

    if (!contact) {
      return NextResponse.json({ error: "Contact not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true, contact });
  } catch (error) {
    logger.error("Erro ao buscar contato", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();

    const allowedFields = [
      "name",
      "status",
      "dog_name",
      "dog_age",
      "dog_size",
      "city",
      "main_problem",
      "lead_temperature",
      "conversation_stage",
      "automatic_service_enabled",
    ];

    const dataToUpdate: any = {};
    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        dataToUpdate[field] = body[field];
      }
    }

    // Se status for alterado, validar enum e registrar log
    if (dataToUpdate.status) {
      if (!Object.values(ContactStatus).includes(dataToUpdate.status)) {
        return NextResponse.json({ error: "Invalid status" }, { status: 400 });
      }
      logger.info("alteração de status", {
        contactId: id,
        newStatus: dataToUpdate.status,
      });

      // Se virou BLOQUEADO, ALUNO ou EX_ALUNO, desabilita atendimento comercial automático
      if (
        dataToUpdate.status === ContactStatus.BLOQUEADO ||
        dataToUpdate.status === ContactStatus.ALUNO ||
        dataToUpdate.status === ContactStatus.EX_ALUNO
      ) {
        dataToUpdate.automatic_service_enabled = false;
      }
    }

    const updated = await prisma.contact.update({
      where: { id },
      data: dataToUpdate,
      include: { lead_data: true },
    });

    return NextResponse.json({ success: true, contact: updated });
  } catch (error) {
    logger.error("Erro ao atualizar contato", error);
    return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
  }
}
