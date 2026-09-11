import { MessageDirection, ProcessingStatus } from "@prisma/client";
import { env } from "../config";
import { prisma } from "../db";
import { logger } from "../logger";
import { ConversationService } from "./conversation.service";
import { EvolutionService } from "./evolution.service";
import { GeminiService } from "./gemini.service";

export class BufferService {
  // Mapa de timers ativos por conversa (concurrency safe em processo)
  private static activeTimers = new Map<string, NodeJS.Timeout>();

  /**
   * Adiciona uma mensagem ao buffer da conversa e inicia/reinicia o temporizador de debounce.
   */
  static async addMessage(conversationId: string, messageId: string, delayMs?: number) {
    const delay = delayMs ?? env.MESSAGE_BUFFER_DELAY_MS;

    // 1. Criar registro no MESSAGE_BUFFER com status PENDING
    await prisma.messageBuffer.upsert({
      where: { message_id: messageId },
      create: {
        conversation_id: conversationId,
        message_id: messageId,
        status: ProcessingStatus.PENDING,
      },
      update: {
        status: ProcessingStatus.PENDING,
      },
    });

    // 2. Se já existir temporizador para essa conversa, cancela (reinicia)
    if (this.activeTimers.has(conversationId)) {
      clearTimeout(this.activeTimers.get(conversationId)!);
      this.activeTimers.delete(conversationId);
      logger.info("buffer reiniciado", { conversationId, delayMs: delay });
    } else {
      logger.info("buffer iniciado", { conversationId, delayMs: delay });
    }

    // 3. Agenda a execução após o período de silêncio
    const timer = setTimeout(async () => {
      this.activeTimers.delete(conversationId);
      try {
        await this.processBuffer(conversationId);
      } catch (err) {
        logger.error("Erro inesperado no processamento do buffer", err, { conversationId });
      }
    }, delay);

    this.activeTimers.set(conversationId, timer);
  }

  /**
   * Força o processamento imediato do buffer (útil para testes determinísticos ou flush)
   */
  static async flushImmediately(conversationId: string) {
    if (this.activeTimers.has(conversationId)) {
      clearTimeout(this.activeTimers.get(conversationId)!);
      this.activeTimers.delete(conversationId);
    }
    return await this.processBuffer(conversationId);
  }

  /**
   * Processa todas as mensagens pendentes acumuladas no buffer da conversa com lock de concorrência.
   */
  static async processBuffer(conversationId: string) {
    logger.info("Iniciando processamento do buffer", { conversationId });

    // 1. LOCK DE CONCORRÊNCIA ATÔMICO
    // Pega todos os itens PENDING da conversa e transiciona para PROCESSING
    const pendingItems = await prisma.$transaction(async (tx) => {
      const items = await tx.messageBuffer.findMany({
        where: {
          conversation_id: conversationId,
          status: ProcessingStatus.PENDING,
        },
        include: { message: true },
        orderBy: { created_at: "asc" },
      });

      if (items.length === 0) {
        return [];
      }

      const itemIds = items.map((i) => i.id);
      const messageIds = items.map((i) => i.message_id);

      await tx.messageBuffer.updateMany({
        where: { id: { in: itemIds } },
        data: { status: ProcessingStatus.PROCESSING },
      });

      await tx.message.updateMany({
        where: { id: { in: messageIds } },
        data: { processing_status: ProcessingStatus.PROCESSING },
      });

      return items;
    });

    if (pendingItems.length === 0) {
      logger.info("Nenhuma mensagem pendente no buffer para processar", { conversationId });
      return;
    }

    logger.info("buffer processado", {
      conversationId,
      messagesCount: pendingItems.length,
    });

    const conversation = await prisma.conversation.findUnique({
      where: { id: conversationId },
      include: { contact: true },
    });

    if (!conversation) {
      logger.error("Conversa não encontrada ao processar buffer", null, { conversationId });
      return;
    }

    const contactId = conversation.contact_id;
    const messageIds = pendingItems.map((i) => i.message_id);

    try {
      // 2. VERIFICAÇÃO DO GATEKEEPER DE REGRAS DE NEGÓCIO (BACKEND)
      const gatekeeper = await ConversationService.verifyGatekeeper(contactId, conversationId);

      if (!gatekeeper.allowedToAi) {
        logger.info(`Gatekeeper barrou IA: ${gatekeeper.reason}`, {
          contactId,
          status: gatekeeper.contact.status,
          conversationStatus: gatekeeper.conversation.status,
        });

        // Caso seja aluno ou ex-aluno: executar regra de redirecionamento se aplicável
        if (gatekeeper.reason === "STUDENT" || gatekeeper.reason === "EX_STUDENT") {
          await ConversationService.handleStudentRedirect(gatekeeper.contact, gatekeeper.conversation);
        }

        // Marcar buffer como processado sem chamar o Gemini
        await prisma.messageBuffer.updateMany({
          where: { message_id: { in: messageIds } },
          data: { status: ProcessingStatus.PROCESSED, processed_at: new Date() },
        });
        await prisma.message.updateMany({
          where: { id: { in: messageIds } },
          data: { processing_status: ProcessingStatus.PROCESSED },
        });
        return;
      }

      // 3. CONSOLIDAÇÃO DO CONTEÚDO DAS MENSAGENS EM ORDEM CRONOLÓGICA
      const consolidatedContent = pendingItems
        .map((item, index) => `Mensagem ${index + 1}:\n${item.message.content}`)
        .join("\n\n");

      // 4. RECUPERAR MEMÓRIA ESTRUTURADA E HISTÓRICO RECENTE
      const contactData = await ConversationService.getStructuredMemory(contactId);

      const recentMessages = await prisma.message.findMany({
        where: {
          conversation_id: conversationId,
          processing_status: ProcessingStatus.PROCESSED,
        },
        orderBy: { created_at: "desc" },
        take: 10,
      });

      const formattedHistory = recentMessages.reverse().map((m) => ({
        role: m.direction === MessageDirection.INCOMING ? ("user" as const) : ("model" as const),
        content: m.content,
      }));

      // 5. CHAMAR O GEMINI
      const aiResult = await GeminiService.generateReply({
        contactData,
        conversationState: {
          lead_temperature: conversation.contact.lead_temperature || "warm",
          conversation_stage: conversation.contact.conversation_stage || "qualification",
        },
        recentMessages: formattedHistory,
        consolidatedBuffer: consolidatedContent,
        conversationId,
      });

      const replyText = aiResult.response?.reply || "Olá, recebemos sua mensagem e já estamos analisando.";

      // 6. ENVIAR RESPOSTA VIA EVOLUTION API
      const sendResult = await EvolutionService.sendTextMessage(conversation.contact.phone, replyText);

      // 7. SALVAR RESPOSTA NO BANCO DE DADOS
      await prisma.message.create({
        data: {
          conversation_id: conversationId,
          contact_id: contactId,
          external_message_id: sendResult.messageId || null,
          direction: MessageDirection.OUTGOING,
          message_type: "text",
          content: replyText,
          ai_generated: true,
          processing_status: ProcessingStatus.PROCESSED,
        },
      });

      // 8. ATUALIZAR DADOS ESTRUTURADOS DO LEAD E ESTADO DA CONVERSA
      await ConversationService.applyAiResult(contactId, conversationId, aiResult.response);

      // 9. FINALIZAR ITENS DO BUFFER COMO PROCESSED
      await prisma.messageBuffer.updateMany({
        where: { message_id: { in: messageIds } },
        data: {
          status: ProcessingStatus.PROCESSED,
          processed_at: new Date(),
        },
      });

      await prisma.message.updateMany({
        where: { id: { in: messageIds } },
        data: { processing_status: ProcessingStatus.PROCESSED },
      });

      logger.info("Buffer finalizado com sucesso e resposta enviada", {
        conversationId,
        replyLength: replyText.length,
      });
    } catch (err) {
      logger.error("Erro durante o processamento do lote do buffer", err, { conversationId });

      // Atualizar status para FAILED para liberar e evitar bloqueio perpétuo
      await prisma.messageBuffer.updateMany({
        where: { message_id: { in: messageIds } },
        data: { status: ProcessingStatus.FAILED },
      });

      await prisma.message.updateMany({
        where: { id: { in: messageIds } },
        data: { processing_status: ProcessingStatus.FAILED },
      });
    }
  }
}
