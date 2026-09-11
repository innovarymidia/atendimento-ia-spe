/**
 * SUITE COMPLETA DE VALIDAÇÃO DOS 16 TESTES OBRIGATÓRIOS (SEÇÃO 31)
 *
 * Executa todas as asserções e regras de negócio no banco SQLite real.
 */

import { ContactStatus, ConversationStatus, MessageDirection, ProcessingStatus } from "@prisma/client";
import { prisma } from "../src/lib/db";
import { ensureSystemDefaults } from "../src/lib/services/system-init.service";
import { ConversationService } from "../src/lib/services/conversation.service";
import { BufferService } from "../src/lib/services/buffer.service";
import { EvolutionService } from "../src/lib/services/evolution.service";
import { GeminiService } from "../src/lib/services/gemini.service";
import { extractEvolutionMessage } from "../src/lib/schemas/evolution.schema";

let passedCount = 0;
let failedCount = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`✅ [PASSOU] ${testName}${detail ? " -> " + detail : ""}`);
    passedCount++;
  } else {
    console.error(`❌ [FALHOU] ${testName}${detail ? " -> " + detail : ""}`);
    failedCount++;
  }
}

async function simulateWebhookRequest(payload: any, bufferDelay = 150) {
  const extracted = extractEvolutionMessage(payload);
  if (!extracted) {
    return { status: 200, body: { ignored: true, reason: "not_a_message_event" } };
  }

  if (extracted.isGroup) {
    return { status: 200, body: { ignored: true, reason: "group_ignored" } };
  }

  if (extracted.fromMe) {
    return { status: 200, body: { ignored: true, reason: "from_me_ignored" } };
  }

  if (!extracted.content) {
    return { status: 200, body: { ignored: true, reason: "empty_content" } };
  }

  const existingMessage = await prisma.message.findUnique({
    where: { external_message_id: extracted.messageId },
  });

  if (existingMessage) {
    return {
      status: 200,
      body: { ignored: true, reason: "duplicate_message", messageId: extracted.messageId },
    };
  }

  const { contact, conversation } =
    await ConversationService.getOrCreateContactAndConversation(
      extracted.phone,
      extracted.pushName
    );

  const savedMessage = await prisma.message.create({
    data: {
      conversation_id: conversation.id,
      contact_id: contact.id,
      external_message_id: extracted.messageId,
      direction: MessageDirection.INCOMING,
      message_type: extracted.messageType,
      content: extracted.content,
      ai_generated: false,
      processing_status: ProcessingStatus.PENDING,
    },
  });

  await BufferService.addMessage(conversation.id, savedMessage.id, bufferDelay);

  return {
    status: 200,
    body: {
      success: true,
      queued: true,
      messageId: savedMessage.id,
      contactId: contact.id,
      conversationId: conversation.id,
    },
  };
}

async function runTests() {
  console.log("==================================================================");
  console.log("🚀 INICIANDO BATERIA DOS 16 TESTES OBRIGATÓRIOS DO SISTEMA");
  console.log("==================================================================\n");

  // Limpar tabelas para garantir estado limpo e reprodutível
  await prisma.aiLog.deleteMany();
  await prisma.messageBuffer.deleteMany();
  await prisma.message.deleteMany();
  await prisma.conversation.deleteMany();
  await prisma.leadData.deleteMany();
  await prisma.contact.deleteMany();

  await ensureSystemDefaults();

  // Preservar métodos originais
  const originalGeminiGen = GeminiService.generateReply;
  const originalSendText = EvolutionService.sendTextMessage;

  // Mock global padrão do EvolutionService para testes que não testam a rede externa
  EvolutionService.sendTextMessage = async () => ({
    success: true,
    messageId: "mock-evo-" + Date.now(),
  });

  // -------------------------------------------------------------------------
  // TESTE 1: Novo número envia "Oi" -> Deve criar NOVO_LEAD
  // -------------------------------------------------------------------------
  const phone1 = "5511999990001";
  const res1 = await simulateWebhookRequest({
    event: "messages.upsert",
    data: {
      key: { id: "MSG_T1_" + Date.now(), remoteJid: `${phone1}@s.whatsapp.net`, fromMe: false },
      pushName: "Carlos Lead",
      message: { conversation: "Oi" },
    },
  });

  const contact1 = await prisma.contact.findUnique({ where: { phone: phone1 } });
  assert(
    res1.body.success === true &&
      contact1 !== null &&
      contact1.status === ContactStatus.NOVO_LEAD &&
      contact1.automatic_service_enabled === true,
    "TESTE 1: Novo número envia 'Oi'",
    `Contato criado como ${contact1?.status}, automatic_service_enabled=${contact1?.automatic_service_enabled}`
  );

  // Aguardar processamento do buffer do teste 1
  await new Promise((r) => setTimeout(r, 250));

  // -------------------------------------------------------------------------
  // TESTE 2: Novo lead envia 4 mensagens rapidamente -> Deve ocorrer apenas UMA chamada ao Gemini
  // -------------------------------------------------------------------------
  const phone2 = "5511999990002";
  let geminiCallsCount = 0;
  let targetConv2Id = "";

  GeminiService.generateReply = async (input) => {
    if (input.conversationId === targetConv2Id) {
      geminiCallsCount++;
    }
    return {
      response: {
        reply: "Olá! Como posso ajudar com o adestramento do seu cão?",
        conversation_stage: "qualification",
        lead_temperature: "warm",
        extracted_data: {},
        should_transfer_to_human: false,
        transfer_reason: null,
      },
      rawSuccess: true,
    };
  };

  const burstIds = ["BURST_1", "BURST_2", "BURST_3", "BURST_4"];
  for (const id of burstIds) {
    const res = await simulateWebhookRequest({
      event: "messages.upsert",
      data: {
        key: { id: `MSG_T2_${id}_${Date.now()}`, remoteJid: `${phone2}@s.whatsapp.net`, fromMe: false },
        pushName: "Burst User",
        message: { conversation: `Mensagem ${id}` },
      },
    }, 150);
    targetConv2Id = res.body.conversationId;
  }

  // Esperar o buffer consolidar e disparar
  await new Promise((r) => setTimeout(r, 350));

  assert(
    geminiCallsCount === 1,
    "TESTE 2: Quatro mensagens rápidas consolidam em 1 chamada ao Gemini",
    `Total de chamadas para a conversa 2: ${geminiCallsCount}`
  );

  // -------------------------------------------------------------------------
  // TESTE 3: Duas mensagens chegam dentro do buffer -> O timer deve reiniciar
  // -------------------------------------------------------------------------
  const phone3 = "5511999990003";
  let timerRestartCalls = 0;
  let targetConv3Id = "";

  GeminiService.generateReply = async (input) => {
    if (input.conversationId === targetConv3Id) {
      timerRestartCalls++;
    }
    return {
      response: {
        reply: "Recebi ambas as mensagens consolidando o conteúdo.",
        conversation_stage: "qualification",
        lead_temperature: "warm",
        extracted_data: {},
        should_transfer_to_human: false,
        transfer_reason: null,
      },
      rawSuccess: true,
    };
  };

  // Msg 1 chega com delay de 200ms
  const res3_1 = await simulateWebhookRequest({
    event: "messages.upsert",
    data: {
      key: { id: "MSG_T3_1_" + Date.now(), remoteJid: `${phone3}@s.whatsapp.net`, fromMe: false },
      message: { conversation: "Primeira parte" },
    },
  }, 200);
  targetConv3Id = res3_1.body.conversationId;

  // Aguarda 100ms (menos que o buffer de 200ms) e envia a segunda mensagem
  await new Promise((r) => setTimeout(r, 100));

  await simulateWebhookRequest({
    event: "messages.upsert",
    data: {
      key: { id: "MSG_T3_2_" + Date.now(), remoteJid: `${phone3}@s.whatsapp.net`, fromMe: false },
      message: { conversation: "Segunda parte logo em seguida" },
    },
  }, 200);

  // Aguarda 350ms para processamento do timer reiniciado
  await new Promise((r) => setTimeout(r, 350));

  assert(
    timerRestartCalls === 1,
    "TESTE 3: Mensagens dentro do buffer reiniciam o timer e agrupam",
    `Chamadas disparadas: ${timerRestartCalls}`
  );

  // -------------------------------------------------------------------------
  // TESTE 4: Mensagem duplicada chega -> Não deve gerar processamento duplicado
  // -------------------------------------------------------------------------
  const fixedMsgId = "IDEMPOTENT_ID_9999";
  const phone4 = "5511999990004";
  const res4_first = await simulateWebhookRequest({
    event: "messages.upsert",
    data: {
      key: { id: fixedMsgId, remoteJid: `${phone4}@s.whatsapp.net`, fromMe: false },
      message: { conversation: "Mensagem original" },
    },
  }, 100);
  const res4_dup = await simulateWebhookRequest({
    event: "messages.upsert",
    data: {
      key: { id: fixedMsgId, remoteJid: `${phone4}@s.whatsapp.net`, fromMe: false },
      message: { conversation: "Mensagem original repetida" },
    },
  }, 100);

  const countInDb = await prisma.message.count({ where: { external_message_id: fixedMsgId } });
  assert(
    res4_first.body.success === true &&
      res4_dup.body.ignored === true &&
      res4_dup.body.reason === "duplicate_message" &&
      countInDb === 1,
    "TESTE 4: Idempotência de mensagem duplicada",
    `Duplicada descartada com sucesso. Registros no banco: ${countInDb}`
  );

  await new Promise((r) => setTimeout(r, 200));

  // -------------------------------------------------------------------------
  // TESTE 5: Mensagem de grupo chega -> Deve ser ignorada
  // -------------------------------------------------------------------------
  const res5 = await simulateWebhookRequest({
    event: "messages.upsert",
    data: {
      key: { id: "GRP_MSG_" + Date.now(), remoteJid: "12036300000000000@g.us", fromMe: false },
      isGroup: true,
      message: { conversation: "Olá grupo" },
    },
  });

  assert(
    res5.body.ignored === true && res5.body.reason === "group_ignored",
    "TESTE 5: Mensagem de grupo ignorada",
    `Razão: ${res5.body.reason}`
  );

  // -------------------------------------------------------------------------
  // TESTE 6: Mensagem enviada pelo próprio bot (fromMe) -> Deve ser ignorada
  // -------------------------------------------------------------------------
  const res6 = await simulateWebhookRequest({
    event: "messages.upsert",
    data: {
      key: { id: "BOT_MSG_" + Date.now(), remoteJid: "5511999990006@s.whatsapp.net", fromMe: true },
      message: { conversation: "Mensagem enviada pelo bot" },
    },
  });

  assert(
    res6.body.ignored === true && res6.body.reason === "from_me_ignored",
    "TESTE 6: Mensagem enviada pelo próprio bot ignorada (anti-loop)",
    `Razão: ${res6.body.reason}`
  );

  // -------------------------------------------------------------------------
  // TESTE 7: ALUNO envia mensagem -> Não deve receber atendimento comercial
  // -------------------------------------------------------------------------
  const phone7 = "5511999990007";
  const { contact: c7, conversation: conv7 } =
    await ConversationService.getOrCreateContactAndConversation(phone7, "Aluno João");
  await prisma.contact.update({
    where: { id: c7.id },
    data: { status: ContactStatus.ALUNO },
  });

  let alunoAiCalled = false;
  GeminiService.generateReply = async (input) => {
    if (input.conversationId === conv7.id) {
      alunoAiCalled = true;
    }
    return {
      response: {
        reply: "IA não deveria ter sido chamada",
        conversation_stage: "qualification",
        lead_temperature: "warm",
        extracted_data: {},
        should_transfer_to_human: false,
        transfer_reason: null,
      },
      rawSuccess: true,
    };
  };

  await simulateWebhookRequest({
    event: "messages.upsert",
    data: {
      key: { id: "MSG_ALUNO_" + Date.now(), remoteJid: `${phone7}@s.whatsapp.net`, fromMe: false },
      message: { conversation: "Preciso de ajuda com a aula" },
    },
  }, 100);
  await new Promise((r) => setTimeout(r, 250));

  const updatedConv7 = await prisma.conversation.findUnique({ where: { id: conv7.id } });
  assert(
    alunoAiCalled === false && updatedConv7?.status === ConversationStatus.HUMAN_ACTIVE,
    "TESTE 7: ALUNO não recebe atendimento comercial da IA",
    `IA chamada: ${alunoAiCalled}, Conversa status: ${updatedConv7?.status}`
  );

  // -------------------------------------------------------------------------
  // TESTE 8: EX_ALUNO envia mensagem -> Não deve receber atendimento comercial
  // -------------------------------------------------------------------------
  const phone8 = "5511999990008";
  const { contact: c8, conversation: conv8 } =
    await ConversationService.getOrCreateContactAndConversation(phone8, "Ex Aluno Pedro");
  await prisma.contact.update({
    where: { id: c8.id },
    data: { status: ContactStatus.EX_ALUNO },
  });

  let exAlunoAiCalled = false;
  GeminiService.generateReply = async (input) => {
    if (input.conversationId === conv8.id) {
      exAlunoAiCalled = true;
    }
    return {
      response: {
        reply: "IA não deveria ter sido chamada",
        conversation_stage: "qualification",
        lead_temperature: "warm",
        extracted_data: {},
        should_transfer_to_human: false,
        transfer_reason: null,
      },
      rawSuccess: true,
    };
  };

  await simulateWebhookRequest({
    event: "messages.upsert",
    data: {
      key: { id: "MSG_EX_ALUNO_" + Date.now(), remoteJid: `${phone8}@s.whatsapp.net`, fromMe: false },
      message: { conversation: "Gostaria de retomar o adestramento" },
    },
  }, 100);
  await new Promise((r) => setTimeout(r, 250));

  assert(
    exAlunoAiCalled === false,
    "TESTE 8: EX_ALUNO não recebe atendimento comercial da IA",
    `IA chamada: ${exAlunoAiCalled}`
  );

  // -------------------------------------------------------------------------
  // TESTE 9: BLOQUEADO envia mensagem -> Não deve receber resposta automática
  // -------------------------------------------------------------------------
  const phone9 = "5511999990009";
  const { contact: c9, conversation: conv9 } =
    await ConversationService.getOrCreateContactAndConversation(phone9, "Spam User");
  await prisma.contact.update({
    where: { id: c9.id },
    data: { status: ContactStatus.BLOQUEADO },
  });

  let blockedAiCalled = false;
  let blockedEvoCalled = false;
  GeminiService.generateReply = async (input) => {
    if (input.conversationId === conv9.id) {
      blockedAiCalled = true;
    }
    return { response: {} as any, rawSuccess: false };
  };
  EvolutionService.sendTextMessage = async () => {
    blockedEvoCalled = true;
    return { success: true };
  };

  await simulateWebhookRequest({
    event: "messages.upsert",
    data: {
      key: { id: "MSG_BLOCKED_" + Date.now(), remoteJid: `${phone9}@s.whatsapp.net`, fromMe: false },
      message: { conversation: "Olá tem alguém aí?" },
    },
  }, 100);
  await new Promise((r) => setTimeout(r, 250));

  assert(
    blockedAiCalled === false && blockedEvoCalled === false,
    "TESTE 9: BLOQUEADO não recebe nenhuma resposta automática",
    `IA chamada: ${blockedAiCalled}, Evolution chamada: ${blockedEvoCalled}`
  );

  // -------------------------------------------------------------------------
  // TESTE 10: Humano assume conversa (Takeover) -> IA não deve responder
  // -------------------------------------------------------------------------
  const phone10 = "5511999990010";
  const { conversation: conv10 } =
    await ConversationService.getOrCreateContactAndConversation(phone10, "Lead Takeover");

  // Humano assume
  await ConversationService.takeoverConversation(conv10.id);

  let humanActiveAiCalled = false;
  GeminiService.generateReply = async (input) => {
    if (input.conversationId === conv10.id) {
      humanActiveAiCalled = true;
    }
    return { response: {} as any, rawSuccess: false };
  };

  await simulateWebhookRequest({
    event: "messages.upsert",
    data: {
      key: { id: "MSG_TAKEOVER_" + Date.now(), remoteJid: `${phone10}@s.whatsapp.net`, fromMe: false },
      message: { conversation: "Mensagem enquanto atendente humano está ativo" },
    },
  }, 100);
  await new Promise((r) => setTimeout(r, 250));

  assert(
    humanActiveAiCalled === false,
    "TESTE 10: Humano assume conversa (HUMAN_ACTIVE) -> IA silenciada",
    `IA chamada: ${humanActiveAiCalled}`
  );

  // -------------------------------------------------------------------------
  // TESTE 11: Humano devolve conversa para IA -> IA pode voltar a responder
  // -------------------------------------------------------------------------
  await ConversationService.returnToAi(conv10.id);

  let returnAiCalled = false;
  GeminiService.generateReply = async (input) => {
    if (input.conversationId === conv10.id) {
      returnAiCalled = true;
    }
    return {
      response: {
        reply: "Olá novamente, estou de volta para tirar suas dúvidas!",
        conversation_stage: "qualification",
        lead_temperature: "warm",
        extracted_data: {},
        should_transfer_to_human: false,
        transfer_reason: null,
      },
      rawSuccess: true,
    };
  };

  await simulateWebhookRequest({
    event: "messages.upsert",
    data: {
      key: { id: "MSG_RETURN_AI_" + Date.now(), remoteJid: `${phone10}@s.whatsapp.net`, fromMe: false },
      message: { conversation: "Voltou?" },
    },
  }, 100);
  await new Promise((r) => setTimeout(r, 250));

  assert(
    returnAiCalled === true,
    "TESTE 11: Humano devolve conversa para IA -> IA volta a responder",
    `IA chamada com sucesso: ${returnAiCalled}`
  );

  // -------------------------------------------------------------------------
  // TESTE 12: Gemini retorna JSON inválido -> Sistema não envia resposta quebrada
  // -------------------------------------------------------------------------
  const phone12 = "5511999990012";
  const { conversation: conv12 } =
    await ConversationService.getOrCreateContactAndConversation(phone12, "Lead Invalid JSON");

  // Mock Gemini cliente retornando texto corrompido
  (GeminiService as any).client = {
    models: {
      generateContent: async () => ({ text: "Isto definitivamente não é um JSON válido { broken" }),
    },
  };

  // Restaurar método original de generateReply para testar validação e fallbacks
  GeminiService.generateReply = originalGeminiGen;

  const resGen12 = await GeminiService.generateReply(
    {
      contactData: {},
      conversationState: {},
      recentMessages: [],
      consolidatedBuffer: "Mensagem de teste",
      conversationId: conv12.id,
    },
    1
  );

  assert(
    resGen12.rawSuccess === false &&
      resGen12.response.should_transfer_to_human === true &&
      resGen12.response.reply.includes("equipe de atendimento"),
    "TESTE 12: JSON inválido tratado com segurança e fallback para humano",
    `rawSuccess=${resGen12.rawSuccess}, transfer=${resGen12.response.should_transfer_to_human}`
  );

  // -------------------------------------------------------------------------
  // TESTE 13: Gemini fica indisponível -> Sistema trata erro e faz log
  // -------------------------------------------------------------------------
  (GeminiService as any).client = {
    models: {
      generateContent: async () => {
        throw new Error("Gemini Service 503 Unavailable");
      },
    },
  };

  const resGen13 = await GeminiService.generateReply(
    {
      contactData: {},
      conversationState: {},
      recentMessages: [],
      consolidatedBuffer: "Mensagem teste offline",
      conversationId: conv12.id,
    },
    1
  );

  const errorLog = await prisma.aiLog.findFirst({
    where: { conversation_id: conv12.id, success: false },
    orderBy: { created_at: "desc" },
  });

  assert(
    resGen13.rawSuccess === false &&
      resGen13.response.should_transfer_to_human === true &&
      errorLog !== null,
    "TESTE 13: Gemini indisponível tratado com resiliência e log gravado",
    `Log de erro registrado: ${errorLog?.error}`
  );

  // -------------------------------------------------------------------------
  // TESTE 14: Evolution API fica indisponível -> Sistema trata erro
  // -------------------------------------------------------------------------
  EvolutionService.sendTextMessage = originalSendText;

  // Mock global fetch simulando queda de rede imediata
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("Network connection refused ECONNREFUSED");
  };

  const fakeEvoRes = await EvolutionService.sendTextMessage("5511999999999", "Teste", 1);
  globalThis.fetch = originalFetch;

  assert(
    fakeEvoRes.success === false && Boolean(fakeEvoRes.error),
    "TESTE 14: Evolution API indisponível tratada sem crash",
    `Retorno seguro: ${fakeEvoRes.error}`
  );

  // -------------------------------------------------------------------------
  // TESTE 15: Lead informa "Meu cachorro é o Thor e tem 8 meses" -> Dados salvos na memória estruturada
  // -------------------------------------------------------------------------
  const phone15 = "5511999990015";
  const { contact: c15, conversation: conv15 } =
    await ConversationService.getOrCreateContactAndConversation(phone15, "Roberto Thor");

  // Simular retorno do Gemini extraindo nome e idade do cão
  await ConversationService.applyAiResult(c15.id, conv15.id, {
    reply: "Que ótimo, o Thor ainda é bem jovem!",
    conversation_stage: "qualification",
    lead_temperature: "warm",
    extracted_data: {
      dog_name: "Thor",
      dog_age: "8 meses",
    },
    should_transfer_to_human: false,
    transfer_reason: null,
  });

  const structuredMemory = await ConversationService.getStructuredMemory(c15.id);
  const updatedContact15 = await prisma.contact.findUnique({ where: { id: c15.id } });

  assert(
    structuredMemory.dog_name === "Thor" &&
      structuredMemory.dog_age === "8 meses" &&
      updatedContact15?.dog_name === "Thor" &&
      updatedContact15?.dog_age === "8 meses",
    "TESTE 15: Informações estruturadas (Thor, 8 meses) persistem na memória",
    `dog_name=${structuredMemory.dog_name}, dog_age=${structuredMemory.dog_age}`
  );

  // -------------------------------------------------------------------------
  // TESTE 16: Lead diz "Já sou aluno" -> Interrompe comercial e sinaliza humano sem mudar status definitivo
  // -------------------------------------------------------------------------
  const phone16 = "5511999990016";
  const { contact: c16, conversation: conv16 } =
    await ConversationService.getOrCreateContactAndConversation(phone16, "Marcos");

  await ConversationService.applyAiResult(c16.id, conv16.id, {
    reply: "Entendi! Vou transferir sua mensagem para nossa equipe verificar seu cadastro.",
    conversation_stage: "transferred",
    lead_temperature: "warm",
    extracted_data: {
      is_student: "true",
    },
    should_transfer_to_human: true,
    transfer_reason: "EXISTING_STUDENT",
  });

  const updatedContact16 = await prisma.contact.findUnique({ where: { id: c16.id } });
  const updatedConv16 = await prisma.conversation.findUnique({ where: { id: conv16.id } });

  assert(
    updatedContact16?.status === ContactStatus.NOVO_LEAD &&
      updatedContact16?.automatic_service_enabled === false &&
      updatedConv16?.status === ConversationStatus.HUMAN_ACTIVE &&
      updatedConv16?.transfer_reason === "EXISTING_STUDENT",
    "TESTE 16: 'Já sou aluno' pausa automação e sinaliza humano sem adulterar status definitivo",
    `Contact.status=${updatedContact16?.status}, automatic_service_enabled=${updatedContact16?.automatic_service_enabled}, Conv.status=${updatedConv16?.status}, reason=${updatedConv16?.transfer_reason}`
  );

  // -------------------------------------------------------------------------
  // RELATÓRIO FINAL
  // -------------------------------------------------------------------------
  console.log("\n==================================================================");
  console.log(`🏁 RESULTADO DOS TESTES: ${passedCount}/16 PASSARAM | ${failedCount} FALHARAM`);
  console.log("==================================================================");

  if (failedCount > 0) {
    process.exit(1);
  }
}

runTests().catch((err) => {
  console.error("Erro fatal durante a execução dos testes", err);
  process.exit(1);
});
