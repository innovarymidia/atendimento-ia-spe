import { NextRequest, NextResponse } from 'next/server';
import { Contact, Message, queryOne, queryAll, executeRun } from '@/lib/db';
import { sendWhatsAppText, sendWhatsAppMedia } from '@/lib/evolution';
import { cancelPendingSend } from '@/lib/buffer';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contactId = parseInt(id, 10);
    if (isNaN(contactId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const contact = await queryOne<Contact>('SELECT * FROM contacts WHERE id = ?', [contactId]);
    if (!contact) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });
    }

    const messages = await queryAll<Message>(`
      SELECT * FROM messages WHERE contactId = ? ORDER BY id ASC
    `, [contactId]);

    return NextResponse.json({ contact, messages });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const contactId = parseInt(id, 10);
    if (isNaN(contactId)) {
      return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
    }

    const body = await req.json();
    const text = body.text?.trim();
    const mediaType = body.mediaType; // 'pdf_cuiaba', 'pdf_vg', 'pdf_online'

    const contact = await queryOne<Contact>('SELECT * FROM contacts WHERE id = ?', [contactId]);
    if (!contact) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });
    }

    // Se for envio manual de PDF solicitado pelo operador humano no chat
    if (mediaType) {
      let pdfUrl = '';
      let fileName = '';

      if (mediaType === 'pdf_cuiaba') {
        const row = await queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['pdfCuiabaUrl']);
        pdfUrl = row?.value || 'https://seupetequilibrado.com.br/materiais/cuiaba.pdf';
        fileName = 'Apresentacao-Cuiaba-SPE.pdf';
      } else if (mediaType === 'pdf_vg') {
        const row = await queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['pdfVgUrl']);
        pdfUrl = row?.value || 'https://seupetequilibrado.com.br/materiais/varzea-grande.pdf';
        fileName = 'Apresentacao-Varzea-Grande-SPE.pdf';
      } else {
        const row = await queryOne<{ value: string }>('SELECT value FROM settings WHERE key = ?', ['pdfOnlineUrl']);
        pdfUrl = row?.value || 'https://seupetequilibrado.com.br/materiais/online.pdf';
        fileName = 'Apresentacao-Online-SPE.pdf';
      }

      const mediaResult = await sendWhatsAppMedia(
        contact.phone,
        pdfUrl,
        fileName,
        text || 'Material Informativo - Seu Pet Equilibrado'
      );

      const msgContent = text ? `[PDF Enviado: ${fileName}] ${text}` : `[PDF Enviado: ${fileName}]`;

      const insert = await executeRun(`
        INSERT INTO messages (contactId, sender, content, mediaUrl, createdAt)
        VALUES (?, 'human', ?, ?, CURRENT_TIMESTAMP)
      `, [contactId, msgContent, pdfUrl]);

      await executeRun(`
        UPDATE contacts 
        SET pdfSent = 1, 
            pdfSentAt = CURRENT_TIMESTAMP,
            lastInteractionAt = CURRENT_TIMESTAMP
        WHERE id = ?
      `, [contactId]);

      const created = insert.lastInsertRowid
        ? await queryOne<Message>('SELECT * FROM messages WHERE id = ?', [insert.lastInsertRowid])
        : null;

      return NextResponse.json({ message: created, mediaResult });
    }

    if (!text) {
      return NextResponse.json({ error: 'Texto da mensagem não informado' }, { status: 400 });
    }

    // Cancela qualquer envio pendente da IA para este contato
    cancelPendingSend(contactId);

    // Enviar mensagem de texto via WhatsApp
    const sendResult = await sendWhatsAppText(contact.phone, text);

    // Salvar mensagem enviada como 'human' e pausar IA
    const insert = await executeRun(`
      INSERT INTO messages (contactId, sender, content, isProcessed, createdAt)
      VALUES (?, 'human', ?, 1, CURRENT_TIMESTAMP)
    `, [contactId, text]);

    await executeRun(`
      UPDATE contacts 
      SET lastInteractionAt = CURRENT_TIMESTAMP,
          status = 'atendimento_humano',
          aiActive = 0
      WHERE id = ?
    `, [contactId]);

    const created = insert.lastInsertRowid
      ? await queryOne<Message>('SELECT * FROM messages WHERE id = ?', [insert.lastInsertRowid])
      : null;

    return NextResponse.json({
      message: created,
      sendResult
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
