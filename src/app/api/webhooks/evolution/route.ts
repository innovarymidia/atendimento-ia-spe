import { NextRequest, NextResponse } from 'next/server';
import { getDb, Message } from '@/lib/db';
import { cleanPhoneNumber } from '@/lib/phone';
import { findOrCreateContact, evaluateGuardrail } from '@/lib/guardrail';
import { processConversationWithGemini } from '@/lib/gemini';
import { sendWhatsAppText, sendWhatsAppMedia } from '@/lib/evolution';

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

    const db = getDb();

    // 1. Identificar ou cadastrar o contato
    const contact = findOrCreateContact(cleanPhone, pushName);

    // Se a mensagem partiu de nós mesmos (fromMe), registrar como humano e atualizar lastInteraction
    if (fromMe) {
      if (messageContent) {
        db.prepare(`
          INSERT INTO messages (contactId, sender, content, createdAt)
          VALUES (?, 'human', ?, datetime('now', 'localtime'))
        `).run(contact.id, messageContent);

        db.prepare(`
          UPDATE contacts 
          SET lastInteractionAt = datetime('now', 'localtime') 
          WHERE id = ?
        `).run(contact.id);
      }
      return NextResponse.json({ status: 'from_me_logged' });
    }

    // Se não há texto (áudio, figurinha sem texto, etc.), registrar aviso acolhedor ou salvar
    const incomingText = messageContent.trim() || '[Mídia ou Áudio recebido]';

    // Salvar mensagem do tutor no histórico
    db.prepare(`
      INSERT INTO messages (contactId, sender, content, createdAt)
      VALUES (?, 'user', ?, datetime('now', 'localtime'))
    `).run(contact.id, incomingText);

    db.prepare(`
      UPDATE contacts 
      SET lastInteractionAt = datetime('now', 'localtime') 
      WHERE id = ?
    `).run(contact.id);

    // 2. CAMADA DE CONTROLE DETERMINÍSTICA (GUARDRAIL ANTES DA IA)
    const guard = evaluateGuardrail(contact);
    if (!guard.allowed) {
      console.log(`[SPE Guardrail] IA silenciada para ${contact.phone} (${contact.name}): ${guard.reason}`);
      return NextResponse.json({
        status: 'blocked_by_guardrail',
        reason: guard.reason
      });
    }

    // Atualizar status para em_atendimento_ia se ainda for novo_lead
    if (contact.status === 'novo_lead') {
      db.prepare(`
        UPDATE contacts 
        SET status = 'em_atendimento_ia', updatedAt = datetime('now', 'localtime') 
        WHERE id = ?
      `).run(contact.id);
      contact.status = 'em_atendimento_ia';
    }

    // 3. RECUPERAR HISTÓRICO DA CONVERSA
    const history = db.prepare(`
      SELECT * FROM messages WHERE contactId = ? ORDER BY id ASC LIMIT 50
    `).all(contact.id) as Message[];

    // 4. PROCESSAR COM GEMINI (COM AS 31 REGRAS DO SPE)
    const decision = await processConversationWithGemini(contact, history, incomingText);

    // Atualizar dados coletados do lead
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

    const updatedDogName = decision.dogInfo.name || contact.dogName;
    const updatedDogBreed = decision.dogInfo.breed || contact.dogBreed;
    const updatedDogAge = decision.dogInfo.age || contact.dogAge;
    const updatedBehavior = decision.dogInfo.behaviorSummary || contact.behaviorSummary;
    const nextStep = decision.step || contact.step;

    db.prepare(`
      UPDATE contacts 
      SET city = ?, 
          modality = ?, 
          dogName = ?, 
          dogBreed = ?, 
          dogAge = ?, 
          behaviorSummary = ?, 
          step = ?, 
          updatedAt = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      updatedCity,
      updatedModality,
      updatedDogName,
      updatedDogBreed,
      updatedDogAge,
      updatedBehavior,
      nextStep,
      contact.id
    );

    // 5. DECISÃO DE ENVIO DO PDF E TRANSFERÊNCIA OBRIGATÓRIA PARA HUMANO
    if (decision.shouldSendPdf) {
      // Obter URLs dos materiais cadastrados nas configurações
      const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
      const cuiabaPdfRow = getSetting.get('pdfCuiabaUrl') as { value: string } | undefined;
      const vgPdfRow = getSetting.get('pdfVgUrl') as { value: string } | undefined;
      const onlinePdfRow = getSetting.get('pdfOnlineUrl') as { value: string } | undefined;

      let pdfUrl = onlinePdfRow?.value || 'https://seupetequilibrado.com.br/materiais/online.pdf';
      let fileName = 'Apresentacao-Online-SPE.pdf';

      const cityKey = decision.pdfCityTarget || decision.identifiedCity;
      if (cityKey === 'cuiaba' || updatedCity?.toLowerCase().includes('cuiab')) {
        pdfUrl = cuiabaPdfRow?.value || 'https://seupetequilibrado.com.br/materiais/cuiaba.pdf';
        fileName = 'Apresentacao-Cuiaba-SPE.pdf';
      } else if (cityKey === 'varzea_grande' || updatedCity?.toLowerCase().includes('v') || updatedCity?.toLowerCase().includes('grande')) {
        pdfUrl = vgPdfRow?.value || 'https://seupetequilibrado.com.br/materiais/varzea-grande.pdf';
        fileName = 'Apresentacao-Varzea-Grande-SPE.pdf';
      }

      // Se houver mensagem de Avaliação Inicial separada, enviar antes
      if (decision.assessmentText) {
        await sendWhatsAppText(contact.phone, decision.assessmentText);
        db.prepare(`
          INSERT INTO messages (contactId, sender, content, createdAt)
          VALUES (?, 'assistant', ?, datetime('now', 'localtime'))
        `).run(contact.id, decision.assessmentText);
      }

      // Enviar mensagem de apresentação do PDF
      if (decision.replyText) {
        await sendWhatsAppText(contact.phone, decision.replyText);
        db.prepare(`
          INSERT INTO messages (contactId, sender, content, createdAt)
          VALUES (?, 'assistant', ?, datetime('now', 'localtime'))
        `).run(contact.id, decision.replyText);
      }

      // Enviar o PDF via Evolution API
      const mediaResult = await sendWhatsAppMedia(
        contact.phone,
        pdfUrl,
        fileName,
        'Material Informativo - Seu Pet Equilibrado'
      );

      // Enviar mensagem curta de encerramento da IA e transferência para equipe humana
      const transferMsg = decision.finalTransferMessage ||
        'Prontinho! 😊 Já te enviei o material com todas as informações. A partir daqui, nossa equipe dará continuidade ao atendimento por aqui e poderá te passar os próximos passos.';

      await sendWhatsAppText(contact.phone, transferMsg);

      db.prepare(`
        INSERT INTO messages (contactId, sender, content, mediaUrl, createdAt)
        VALUES (?, 'assistant', ?, ?, datetime('now', 'localtime'))
      `).run(contact.id, `[PDF Enviado: ${fileName}] - ${transferMsg}`, pdfUrl);

      // REGRA OBRIGATÓRIA: Bloqueio pós-transferência (aiActive = 0, status = aguardando_humano)
      db.prepare(`
        UPDATE contacts 
        SET status = 'aguardando_humano', 
            aiActive = 0, 
            pdfSent = 1, 
            pdfSentAt = datetime('now', 'localtime'), 
            step = 'aguardando_humano',
            updatedAt = datetime('now', 'localtime')
        WHERE id = ?
      `).run(contact.id);

      return NextResponse.json({
        success: true,
        action: 'pdf_sent_and_transferred_to_human',
        mediaSent: mediaResult.success
      });
    }

    // 6. FLUXO CONVERSACIONAL REGULAR
    if (decision.replyText) {
      await sendWhatsAppText(contact.phone, decision.replyText);

      db.prepare(`
        INSERT INTO messages (contactId, sender, content, createdAt)
        VALUES (?, 'assistant', ?, datetime('now', 'localtime'))
      `).run(contact.id, decision.replyText);
    }

    return NextResponse.json({
      success: true,
      action: 'replied_regular_flow'
    });
  } catch (error: any) {
    console.error('Erro no processamento do webhook Evolution:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
