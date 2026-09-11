import { ContactStatus, ConversationStatus, MessageDirection, ProcessingStatus } from "@prisma/client";
import { prisma } from "../db";
import { logger } from "../logger";
import { EvolutionService } from "./evolution.service";
import { GeminiResponse } from "../schemas/gemini.schema";

export interface ContactGatekeeperCheck {
  allowedToAi: boolean;
  reason:
    | "ALLOWED"
    | "BLOCKED"
    | "STUDENT"
    | "EX_STUDENT"
    | "HUMAN_ACTIVE"
    | "AUTOMATION_DISABLED";
  contact: any;
  conversation: any;
}

export class ConversationService {
  /**
   * Busca ou cria o contato e garante que exista uma conversa ativa vinculada.
   * Regra #3: Contato desconhecido é criado como NOVO_LEAD com automatic_service_enabled = true.
   */
  static async getOrCreateContactAndConversation(phone: string, pushName?: string) {
    const cleanPhone = phone.replace(/\D/g, "");

    let contact = await prisma.contact.findUnique({
      where: { phone: cleanPhone },
      include: {
        conversations: {
          orderBy: { updated_at: "desc" },
          take: 1,
        },
      },
    });

    if (!contact) {
      contact = await prisma.contact.create({
        data: {
          phone: cleanPhone,
          name: pushName || null,
          status: ContactStatus.NOVO_LEAD,
          automatic_service_enabled: true,
        },
        include: {
          conversations: {
            orderBy: { updated_at: "desc" },
            take: 1,
          },
        },
      });
      logger.info("Novo lead criado no banco", { phone: cleanPhone, status: "NOVO_LEAD" });
    } else if (pushName && !contact.name) {
      contact = await prisma.contact.update({
        where: { id: contact.id },
        data: { name: pushName },
        include: {
          conversations: {
            orderBy: { updated_at: "desc" },
            take: 1,
          },
        },
      });
    }

    let conversation = contact.conversations[0];
    if (!conversation) {
      conversation = await prisma.conversation.create({
        data: {
          contact_id: contact.id,
          status: ConversationStatus.AI_ACTIVE,
        },
      });
      logger.info("Nova conversa criada para o contato", {
        contactId: contact.id,
        conversationId: conversation.id,
      });
    }

    return { contact, conversation };
  }

  /**
   * Gatekeeper central de regras de negócio:
   * Valida status do contato e status da conversa antes de permitir qualquer processamento de IA.
   */
  static async verifyGatekeeper(contactId: string, conversationId: string): Promise<ContactGatekeeperCheck> {
    const contact = await prisma.contact.findUnique({ where: { id: contactId } });
    const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });

    if (!contact || !conversation) {
      throw new Error(`Contato (${contactId}) ou Conversa (${conversationId}) não encontrados`);
    }

    // Regra #2: BLOQUEADO não recebe nenhuma resposta automática
    if (contact.status === ContactStatus.BLOQUEADO) {
      logger.info("Gatekeeper: Contato BLOQUEADO. Nenhuma ação automática.", { contactId: contact.id });
      return { allowedToAi: false, reason: "BLOCKED", contact, conversation };
    }

    // Regra #2 e #16: ALUNO ou EX_ALUNO não recebem atendimento comercial da IA
    if (contact.status === ContactStatus.ALUNO) {
      logger.info("Gatekeeper: Contato é ALUNO. Bloqueando fluxo comercial de IA.", { contactId: contact.id });
      return { allowedToAi: false, reason: "STUDENT", contact, conversation };
    }

    if (contact.status === ContactStatus.EX_ALUNO) {
      logger.info("Gatekeeper: Contato é EX_ALUNO. Bloqueando fluxo comercial de IA.", { contactId: contact.id });
      return { allowedToAi: false, reason: "EX_STUDENT", contact, conversation };
    }

    // Regra #14: Atendimento humano ativo
    if (conversation.status === ConversationStatus.HUMAN_ACTIVE) {
      logger.info("Gatekeeper: Conversa em HUMAN_ACTIVE. IA silenciada.", { conversationId: conversation.id });
      return { allowedToAi: false, reason: "HUMAN_ACTIVE", contact, conversation };
    }

    // Automação desativada individualmente
    if (!contact.automatic_service_enabled) {
      logger.info("Gatekeeper: Automação desativada para este contato.", { contactId: contact.id });
      return { allowedToAi: false, reason: "AUTOMATION_DISABLED", contact, conversation };
    }

    return { allowedToAi: true, reason: "ALLOWED", contact, conversation };
  }

  /**
   * Executa a regra de encaminhamento de alunos/ex-alunos:
   * Envia mensagem padrão e transfere para HUMAN_ACTIVE.
   */
  static async handleStudentRedirect(contact: any, conversation: any) {
    const setting = await prisma.settings.findUnique({ where: { key: "STUDENT_REDIRECT_MESSAGE" } });
    const messageText =
      setting?.value ||
      "Entendi. Como você já teve atendimento com a nossa equipe, vou encaminhar sua mensagem para o responsável pelo seu atendimento.";

    // Enviar mensagem pelo WhatsApp
    await EvolutionService.sendTextMessage(contact.phone, messageText);

    // Registrar mensagem enviada
    await prisma.message.create({
      data: {
        conversation_id: conversation.id,
        contact_id: contact.id,
        direction: MessageDirection.OUTGOING,
        message_type: "text",
        content: messageText,
        ai_generated: true,
        processing_status: ProcessingStatus.PROCESSED,
      },
    });

    // Atualizar conversa para atendimento humano
    await prisma.conversation.update({
      where: { id: conversation.id },
      data: {
        status: ConversationStatus.HUMAN_ACTIVE,
        transfer_reason: contact.status === ContactStatus.ALUNO ? "EXISTING_STUDENT" : "EX_STUDENT",
      },
    });

    // Desabilitar automação
    await prisma.contact.update({
      where: { id: contact.id },
      data: { automatic_service_enabled: false },
    });

    logger.info("Aluno/Ex-aluno redirecionado para atendimento humano", {
      contactId: contact.id,
      status: contact.status,
    });
  }

  /**
   * Atualiza a memória estruturada e os dados do contato a partir do retorno validado do Gemini.
   */
  static async applyAiResult(
    contactId: string,
    conversationId: string,
    aiResult: GeminiResponse
  ) {
    const extracted = aiResult.extracted_data || {};

    // 1. Salvar ou atualizar campos em LeadData
    for (const [field, value] of Object.entries(extracted)) {
      if (typeof value === "string" && value.trim()) {
        await prisma.leadData.upsert({
          where: {
            contact_id_field: {
              contact_id: contactId,
              field: field,
            },
          },
          create: {
            contact_id: contactId,
            field,
            value: value.trim(),
          },
          update: {
            value: value.trim(),
          },
        });
      }
    }

    // 2. Atualizar campos diretos de Contact se identificados
    const updateData: any = {};
    if (extracted.dog_name) updateData.dog_name = extracted.dog_name;
    if (extracted.dog_age) updateData.dog_age = extracted.dog_age;
    if (extracted.dog_size) updateData.dog_size = extracted.dog_size;
    if (extracted.city) updateData.city = extracted.city;
    if (extracted.main_problem) updateData.main_problem = extracted.main_problem;
    if (aiResult.lead_temperature) updateData.lead_temperature = aiResult.lead_temperature;
    if (aiResult.conversation_stage) updateData.conversation_stage = aiResult.conversation_stage;

    // Regra #3: Se o usuário alegou ser aluno/ex-aluno durante a conversa:
    // O sistema NÃO deve alterar o status definitivo sem validação.
    // Pausar atendimento comercial e sinalizar para humano.
    const studentMention =
      aiResult.transfer_reason === "EXISTING_STUDENT" ||
      aiResult.transfer_reason === "EX_STUDENT" ||
      extracted.is_student === "true" ||
      extracted.status === "ALUNO";

    if (studentMention || aiResult.should_transfer_to_human) {
      updateData.automatic_service_enabled = false;
      const finalReason = studentMention
        ? (aiResult.transfer_reason || "EXISTING_STUDENT")
        : (aiResult.transfer_reason || "USER_REQUEST");

      await prisma.conversation.update({
        where: { id: conversationId },
        data: {
          status: ConversationStatus.HUMAN_ACTIVE,
          transfer_reason: finalReason,
        },
      });

      logger.info("Transferência para humano realizada pelo backend", {
        contactId,
        conversationId,
        reason: finalReason,
      });
    }

    if (Object.keys(updateData).length > 0) {
      await prisma.contact.update({
        where: { id: contactId },
        data: updateData,
      });
    }
  }

  /**
   * Recupera a memória estruturada completa do contato (dados já conhecidos).
   */
  static async getStructuredMemory(contactId: string) {
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: { lead_data: true },
    });

    if (!contact) return {};

    const memory: Record<string, string> = {};
    if (contact.name) memory.tutor_name = contact.name;
    if (contact.dog_name) memory.dog_name = contact.dog_name;
    if (contact.dog_age) memory.dog_age = contact.dog_age;
    if (contact.dog_size) memory.dog_size = contact.dog_size;
    if (contact.city) memory.city = contact.city;
    if (contact.main_problem) memory.main_problem = contact.main_problem;

    for (const item of contact.lead_data) {
      memory[item.field] = item.value;
    }

    return memory;
  }

  /**
   * Transfere atendimento para humano (Takeover).
   */
  static async takeoverConversation(conversationId: string, reason = "MANUAL_TAKEOVER") {
    const conv = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: ConversationStatus.HUMAN_ACTIVE,
        transfer_reason: reason,
      },
      include: { contact: true },
    });

    await prisma.contact.update({
      where: { id: conv.contact_id },
      data: { automatic_service_enabled: false },
    });

    logger.info("Atendente assumiu atendimento (HUMAN_ACTIVE)", { conversationId });
    return conv;
  }

  /**
   * Devolve conversa para a IA (Return to AI).
   */
  static async returnToAi(conversationId: string) {
    const conv = await prisma.conversation.update({
      where: { id: conversationId },
      data: {
        status: ConversationStatus.AI_ACTIVE,
        transfer_reason: null,
      },
      include: { contact: true },
    });

    await prisma.contact.update({
      where: { id: conv.contact_id },
      data: { automatic_service_enabled: true },
    });

    logger.info("Conversa devolvida para IA (AI_ACTIVE)", { conversationId });
    return conv;
  }
}
