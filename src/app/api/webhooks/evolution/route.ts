import { NextRequest, NextResponse, after } from 'next/server';
import { Contact, Message, queryOne, queryAll, executeRun } from '@/lib/db';
import { cleanPhoneNumber } from '@/lib/phone';
import { findOrCreateContact, evaluateGuardrail } from '@/lib/guardrail';
import { processConversationWithGemini } from '@/lib/gemini';
import { sendWhatsAppText, sendWhatsAppMedia } from '@/lib/evolution';
import {
  acquireLock,
  releaseLock,
  getUnprocessedMessages,
  markMessagesAsProcessed,
  getHumanDelayMs,
  BUFFER_WINDOW_MS,
  cancelPendingSend
} from '@/lib/buffer';
import { validateAiResponse } from '@/lib/debugger';
import {
  parseConversationState,
  serializeConversationState,
  evaluateCaseUnderstanding,
  isPdfExplicitlyAllowed,
  ConversationState
} from '@/lib/conversation-state';
import { logEvent } from '@/lib/logger';

export const maxDuration = 60; // 60 segundos de tempo limite para execução de background no Vercel

/**
 * Worker do Buffer e Envio Inteligente por Contato
 */
export async function processContactBuffer(contactId: number): Promise<{ processed: boolean; reason?: string }> {
  // 1. Lock de Concorrência: se outro worker já estiver processando este contato, sai imediatamente
  const locked = await acquireLock(contactId);
  if (!locked) {
    return { processed: false, reason: 'concurrency_locked' };
  }

  try {
    // 2. Janela de silêncio para agrupar mensagens consecutivas (3 a 4 segundos)
    const initialWaitMs = 3500;
    await new Promise(r => setTimeout(r, initialWaitMs));

    // 3. Recupera todas as mensagens do usuário acumuladas no buffer
    let pendingMessages = await getUnprocessedMessages(contactId);
    if (pendingMessages.length === 0) {
      return { processed: false, reason: 'no_pending_messages' };
    }

    // Se uma nova mensagem acabou de chegar há menos de 1.5s, dá mais 1.5s de respiro para finalizar o pensamento do tutor
    const lastMsg = pendingMessages[pendingMessages.length - 1];
    const lastMsgTime = lastMsg.createdAt ? new Date(lastMsg.createdAt).getTime() : 0;
    if (lastMsgTime && !isNaN(lastMsgTime) && Date.now() - lastMsgTime < 1500) {
      await new Promise(r => setTimeout(r, 1500));
      pendingMessages = await getUnprocessedMessages(contactId);
    }

    const contact = await queryOne<Contact>('SELECT * FROM contacts WHERE id = ?', [contactId]);
    if (!contact) {
      return { processed: false, reason: 'contact_not_found' };
    }

    // 4. Guardrail determinístico pré-processamento
    const guard = await evaluateGuardrail(contact);
    if (!guard.allowed) {
      logEvent({
        eventType: 'GUARDRAIL_BLOCKED',
        contactId,
        details: { reason: guard.reason }
      });
      await markMessagesAsProcessed(pendingMessages.map(m => m.id));
      return { processed: false, reason: 'guardrail_blocked' };
    }

    // 5. Consolidação de mensagens em um único bloco de texto
    const combinedIncomingText = pendingMessages.map(m => m.content).join('\n');

    logEvent({
      eventType: 'BUFFER_FLUSHED',
      contactId,
      details: {
        messagesCount: pendingMessages.length,
        combinedTextPreview: combinedIncomingText.slice(0, 100)
      }
    });

    // 6. Estado da Conversa e Histórico
    const currentState = parseConversationState(contact.conversationState, contact);
    const history = await queryAll<Message>(
      'SELECT * FROM messages WHERE contactId = ? ORDER BY id ASC LIMIT 50',
      [contactId]
    );

    // 7. Processamento Gemini 2-Fases (Interpretação e Resposta Única)
    const decision = await processConversationWithGemini(
      contact,
      history,
      combinedIncomingText,
      currentState
    );

    // Se o contato for aluno/ex-aluno ou pediu humano, transfere imediatamente
    if (decision.isStudentOrExcluded || decision.wantsHuman) {
      const handoffText = decision.replyText ||
        'Com certeza! Vou transferir seu atendimento agora mesmo para nossa equipe dar continuidade por aqui!';

      await sendWhatsAppText(contact.phone, handoffText);

      await executeRun(`
        INSERT INTO messages (contactId, sender, content, isProcessed, createdAt)
        VALUES (?, 'assistant', ?, 1, CURRENT_TIMESTAMP)
      `, [contactId, handoffText]);

      const updatedCategory = decision.isStudentOrExcluded ? 'aluno' : contact.category;
      const nextState: ConversationState = {
        ...currentState,
        etapa: 'HUMANO',
        lead_status: decision.isStudentOrExcluded ? 'aluno' : 'humano',
        lastUpdated: new Date().toISOString()
      };

      await executeRun(`
        UPDATE contacts 
        SET category = ?,
            status = 'aguardando_humano',
            aiActive = 0,
            stage = 'HUMANO',
            conversationState = ?,
            notes = COALESCE(notes, '') || ?,
            updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        updatedCategory,
        serializeConversationState(nextState),
        decision.isStudentOrExcluded ? ' [Lead identificado como aluno/ex-aluno]' : ' [Solicitou atendimento humano]',
        contactId
      ]);

      await markMessagesAsProcessed(pendingMessages.map(m => m.id));
      return { processed: true, reason: 'student_or_human_handoff' };
    }

    // 8. Envio de Material / PDF com Travas Estruturais no Código
    let pdfSentSuccess = false;
    let pdfUrlUsed: string | undefined;

    const isCaseUnderstood = evaluateCaseUnderstanding(currentState, combinedIncomingText, history);
    const isPdfAllowed = isPdfExplicitlyAllowed(combinedIncomingText, history, currentState);
    const cityKey = decision.pdfCityTarget || decision.identifiedCity || currentState.facts.city;

    // TRAVA 1: Envio do PDF só ocorre se shouldSendPdf for true E o tutor autorizou expressamente (pdf_permitido)
    if (decision.shouldSendPdf && isPdfAllowed && cityKey) {
      const cuiabaPdfRow = await queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['pdfCuiabaUrl']);
      const vgPdfRow = await queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['pdfVgUrl']);
      const onlinePdfRow = await queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['pdfOnlineUrl']);

      let pdfUrl = onlinePdfRow?.value || 'https://drive.google.com/file/d/18dLsAe1CDCL60PdOSN-oWCMlKuadxrOP/view?usp=drive_link';

      if (cityKey === 'cuiaba' || cityKey.toLowerCase().includes('cuiab')) {
        pdfUrl = cuiabaPdfRow?.value || 'https://drive.google.com/file/d/1g6Dq2xzqtlZTtZCn94H4D46blcovKwOS/view?usp=drive_link';
      } else if (cityKey === 'varzea_grande' || cityKey.toLowerCase().includes('v') || cityKey.toLowerCase().includes('grande')) {
        pdfUrl = vgPdfRow?.value || 'https://drive.google.com/file/d/1_WQL1Xf27ITH2edyzH4I-f-j2ruuMaio/view?usp=drive_link';
      }

      pdfUrlUsed = pdfUrl;
      pdfSentSuccess = true;

      // Substitui placeholders {{PDF_CUIABA}}, {{PDF_VG}}, {{PDF_ONLINE}} pelo link real
      decision.replyText = decision.replyText
        .replace(/\{\{PDF_CUIABA\}\}/gi, pdfUrl)
        .replace(/\{\{PDF_VG\}\}/gi, pdfUrl)
        .replace(/\{\{PDF_ONLINE\}\}/gi, pdfUrl);

      // Se o link ainda não estiver contido no texto, anexa de forma natural e elegante
      if (!decision.replyText.includes(pdfUrl)) {
        decision.replyText += `\n\n📄 Segue o link com o nosso material informativo completo em PDF e valores:\n${pdfUrl}`;
      }
    }

    // 9. Validação pré-envio com Debugger (22 regras de integridade)
    const validation = validateAiResponse({
      aiResponseText: decision.replyText,
      userMessage: combinedIncomingText,
      conversationHistory: history,
      contact,
      state: currentState,
      pdfSentSuccess
    });

    if (validation.shouldHandoffToHuman) {
      await sendWhatsAppText(contact.phone, validation.sanitizedText);

      await executeRun(`
        INSERT INTO messages (contactId, sender, content, isProcessed, createdAt)
        VALUES (?, 'assistant', ?, 1, CURRENT_TIMESTAMP)
      `, [contactId, validation.sanitizedText]);

      await executeRun(`
        UPDATE contacts 
        SET status = 'aguardando_humano',
            aiActive = 0,
            stage = 'HUMANO',
            notes = COALESCE(notes, '') || ?,
            updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [` [Transferido para humano: ${validation.handoffReason || 'Debugger'}]`, contactId]);

      await markMessagesAsProcessed(pendingMessages.map(m => m.id));
      return { processed: true, reason: 'validation_handoff' };
    }

    // 10. Envio de Mensagem ÚNICA Consolidada via Evolution API
    const sendResult = await sendWhatsAppText(contact.phone, validation.sanitizedText);

    if (sendResult.success) {
      await executeRun(`
        INSERT INTO messages (contactId, sender, content, mediaUrl, isProcessed, createdAt)
        VALUES (?, 'assistant', ?, ?, 1, CURRENT_TIMESTAMP)
      `, [contactId, validation.sanitizedText, pdfUrlUsed || null]);

      // Atualizar dados cadastrais extraídos
      const updatedDogName = decision.extractedFacts.dogName || contact.dogName;
      const updatedDogBreed = decision.extractedFacts.dogBreed || contact.dogBreed;
      const updatedDogAge = decision.extractedFacts.dogAge || contact.dogAge;
      const updatedDogProblem = decision.extractedFacts.dogProblem || contact.behaviorSummary;
      const updatedUserName = decision.extractedFacts.userName || contact.name;

      let updatedCity = contact.city;
      let updatedModality = contact.modality;
      if (decision.identifiedCity) {
        if (decision.identifiedCity === 'cuiaba') {
          updatedCity = 'Cuiabá';
          updatedModality = 'Presencial - João Eduardo';
        } else if (decision.identifiedCity === 'varzea_grande') {
          updatedCity = 'Várzea Grande';
          updatedModality = 'Presencial - João Eduardo';
        } else {
          updatedCity = decision.rawCityName || 'Outras Cidades';
          updatedModality = 'Online - Nicolle';
        }
      }

      // TRAVA 2: avaliacao_apresentada só pode ser true quando caso_minimamente_compreendido = true
      let nextStage = decision.newStage;
      if (['APRESENTACAO_DA_AVALIACAO', 'APRESENTACAO_DE_VALORES_MATERIAL'].includes(nextStage) && !isCaseUnderstood) {
        nextStage = 'COLETA_DE_INFORMACOES';
      }

      const isEvaluationPresented = ['APRESENTACAO_DA_AVALIACAO', 'APRESENTACAO_DE_VALORES_MATERIAL', 'INTERESSE_EM_AGENDAR'].includes(nextStage) && isCaseUnderstood;

      const nextState: ConversationState = {
        ...currentState,
        nome: updatedUserName,
        cidade: updatedCity,
        problema: updatedDogProblem,
        tipo_atendimento: (updatedModality?.toLowerCase().includes('presencial') ? 'presencial_joao' : updatedModality?.toLowerCase().includes('online') ? 'online_nicolle' : null),
        etapa: nextStage,
        facts: {
          dogName: updatedDogName,
          dogBreed: updatedDogBreed,
          dogAge: updatedDogAge,
          dogProblem: updatedDogProblem,
          city: updatedCity
        },
        caso_minimamente_compreendido: isCaseUnderstood,
        avaliacao_apresentada: isEvaluationPresented,
        pdf_permitido: isPdfAllowed,
        material_enviado: pdfSentSuccess || currentState.material_enviado,
        lastUpdated: new Date().toISOString()
      };

      // Se enviou o PDF, transfere obrigatoriamente para a equipe humana (Etapa 7 do SPE)
      const shouldHandoff = pdfSentSuccess;

      await executeRun(`
        UPDATE contacts 
        SET name = COALESCE(?, name),
            city = COALESCE(?, city),
            modality = COALESCE(?, modality),
            dogName = COALESCE(?, dogName),
            dogBreed = COALESCE(?, dogBreed),
            dogAge = COALESCE(?, dogAge),
            behaviorSummary = COALESCE(?, behaviorSummary),
            stage = ?,
            step = ?,
            conversationState = ?,
            status = CASE WHEN ? = 1 THEN 'aguardando_humano' ELSE 'em_atendimento_ia' END,
            aiActive = CASE WHEN ? = 1 THEN 0 ELSE aiActive END,
            pdfSent = CASE WHEN ? = 1 THEN 1 ELSE pdfSent END,
            pdfSentAt = CASE WHEN ? = 1 THEN CURRENT_TIMESTAMP ELSE pdfSentAt END,
            lastInteractionAt = CURRENT_TIMESTAMP,
            updatedAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [
        updatedUserName,
        updatedCity,
        updatedModality,
        updatedDogName,
        updatedDogBreed,
        updatedDogAge,
        updatedDogProblem,
        nextStage,
        nextStage.toLowerCase(),
        serializeConversationState(nextState),
        shouldHandoff ? 1 : 0,
        shouldHandoff ? 1 : 0,
        pdfSentSuccess ? 1 : 0,
        pdfSentSuccess ? 1 : 0,
        contactId
      ]);
    }

    // 11. Marca mensagens como processadas
    await markMessagesAsProcessed(pendingMessages.map(m => m.id));
    return { processed: true };

  } catch (err: any) {
    console.error(`[Webhook Buffer Process] Erro no contato ${contactId}:`, err);
    return { processed: false, reason: err.message };
  } finally {
    await releaseLock(contactId);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const event = body.event || body.type;

    // Verificar se é evento de mensagem
    const isMessageEvent = event === 'messages.upsert' || event === 'MESSAGES_UPSERT' || body.data?.message;
    if (!isMessageEvent) {
      return NextResponse.json({ status: 'ignored_non_message_event' });
    }

    const data = body.data || body;
    const key = data.key || {};
    const remoteJid = key.remoteJid || '';

    // Ignorar mensagens de grupos WhatsApp (@g.us), de status ou de broadcast
    if (!remoteJid || remoteJid.includes('@g.us') || remoteJid.includes('status@broadcast')) {
      return NextResponse.json({ status: 'ignored_group_or_broadcast' });
    }

    const fromMe = Boolean(key.fromMe);
    const pushName = data.pushName || '';
    const externalId = key.id || null;

    // Idempotência: Se a mensagem já foi gravada antes com esse externalId, ignora repetições da API
    if (externalId) {
      const existingMsg = await queryOne<{ id: number }>(
        'SELECT id FROM messages WHERE externalId = ?',
        [externalId]
      );
      if (existingMsg) {
        return NextResponse.json({ status: 'already_processed', messageId: externalId });
      }
    }

    // Extrair o texto da mensagem
    const messageObj = data.message || {};
    const messageContent =
      messageObj.conversation ||
      messageObj.extendedTextMessage?.text ||
      messageObj.imageMessage?.caption ||
      messageObj.videoMessage?.caption ||
      messageObj.documentMessage?.caption ||
      '';

    const cleanPhone = cleanPhoneNumber(remoteJid);
    if (!cleanPhone) {
      return NextResponse.json({ status: 'invalid_phone' });
    }

    // 1. Identificar ou cadastrar o contato
    const contact = await findOrCreateContact(cleanPhone, pushName);

    // Se a mensagem partiu de nós mesmos (fromMe), registrar como humano e pausar buffer da IA
    if (fromMe) {
      cancelPendingSend(contact.id);

      if (messageContent) {
        await executeRun(`
          INSERT INTO messages (contactId, sender, content, externalId, isProcessed, createdAt)
          VALUES (?, 'human', ?, ?, 1, CURRENT_TIMESTAMP)
        `, [contact.id, messageContent, externalId]);

        await executeRun(`
          UPDATE contacts 
          SET lastInteractionAt = CURRENT_TIMESTAMP,
              status = 'atendimento_humano',
              aiActive = 0
          WHERE id = ?
        `, [contact.id]);
      }
      return NextResponse.json({ status: 'from_me_logged' });
    }

    const incomingText = messageContent.trim() || '[Mídia ou Áudio recebido]';

    logEvent({
      eventType: 'MESSAGE_RECEIVED',
      contactId: contact.id,
      contactPhone: contact.phone,
      details: {
        externalId,
        pushName,
        textPreview: incomingText.slice(0, 80)
      }
    });

    // 2. Salvar mensagem do usuário como pendente no buffer (isProcessed = 0)
    await executeRun(`
      INSERT INTO messages (contactId, sender, content, externalId, isProcessed, createdAt)
      VALUES (?, 'user', ?, ?, 0, CURRENT_TIMESTAMP)
    `, [contact.id, incomingText, externalId]);

    const nowIso = new Date().toISOString();
    await executeRun(`
      UPDATE contacts 
      SET lastMessageAt = ?, lastInteractionAt = CURRENT_TIMESTAMP 
      WHERE id = ?
    `, [nowIso, contact.id]);

    // 3. Guardrail inicial rápido: se contato já for aluno/bloqueado, marca como processado e sai
    const initialGuard = await evaluateGuardrail(contact);
    if (!initialGuard.allowed) {
      logEvent({
        eventType: 'GUARDRAIL_BLOCKED',
        contactId: contact.id,
        details: { reason: initialGuard.reason }
      });

      await executeRun(`
        UPDATE messages SET isProcessed = 1 WHERE contactId = ? AND isProcessed = 0
      `, [contact.id]);

      return NextResponse.json({
        status: 'blocked_by_guardrail',
        reason: initialGuard.reason
      });
    }

    // 4. Executa o processamento do buffer de forma direta e segura
    const result = await processContactBuffer(contact.id);

    return NextResponse.json({
      status: result.processed ? 'processed' : 'buffered',
      contactId: contact.id,
      messageId: externalId
    });

  } catch (error: any) {
    console.error('Erro no processamento do webhook Evolution:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
