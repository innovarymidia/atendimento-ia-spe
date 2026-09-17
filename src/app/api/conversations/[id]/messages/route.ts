import { NextRequest, NextResponse } from 'next/server';
import { getDb, Contact, Message } from '@/lib/db';
import { sendWhatsAppText, sendWhatsAppMedia } from '@/lib/evolution';

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

    const db = getDb();
    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId) as Contact | undefined;
    if (!contact) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });
    }

    const messages = db.prepare(`
      SELECT * FROM messages WHERE contactId = ? ORDER BY id ASC
    `).all(contactId) as Message[];

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
    const db = getDb();

    const contact = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId) as Contact | undefined;
    if (!contact) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });
    }

    // Se for envio manual de PDF solicitado pelo operador humano no chat
    if (mediaType) {
      const getSetting = db.prepare('SELECT value FROM settings WHERE key = ?');
      let pdfUrl = '';
      let fileName = '';

      if (mediaType === 'pdf_cuiaba') {
        const row = getSetting.get('pdfCuiabaUrl') as { value: string } | undefined;
        pdfUrl = row?.value || 'https://seupetequilibrado.com.br/materiais/cuiaba.pdf';
        fileName = 'Apresentacao-Cuiaba-SPE.pdf';
      } else if (mediaType === 'pdf_vg') {
        const row = getSetting.get('pdfVgUrl') as { value: string } | undefined;
        pdfUrl = row?.value || 'https://seupetequilibrado.com.br/materiais/varzea-grande.pdf';
        fileName = 'Apresentacao-Varzea-Grande-SPE.pdf';
      } else {
        const row = getSetting.get('pdfOnlineUrl') as { value: string } | undefined;
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

      const insert = db.prepare(`
        INSERT INTO messages (contactId, sender, content, mediaUrl, createdAt)
        VALUES (?, 'human', ?, ?, datetime('now', 'localtime'))
      `).run(contactId, msgContent, pdfUrl);

      db.prepare(`
        UPDATE contacts 
        SET pdfSent = 1, 
            pdfSentAt = datetime('now', 'localtime'),
            lastInteractionAt = datetime('now', 'localtime')
        WHERE id = ?
      `).run(contactId);

      const created = db.prepare('SELECT * FROM messages WHERE id = ?').get(insert.lastInsertRowid);
      return NextResponse.json({ message: created, mediaResult });
    }

    if (!text) {
      return NextResponse.json({ error: 'Texto da mensagem não informado' }, { status: 400 });
    }

    // Enviar mensagem de texto via WhatsApp
    const sendResult = await sendWhatsAppText(contact.phone, text);

    // Salvar mensagem enviada como 'human'
    const insert = db.prepare(`
      INSERT INTO messages (contactId, sender, content, createdAt)
      VALUES (?, 'human', ?, datetime('now', 'localtime'))
    `).run(contactId, text);

    db.prepare(`
      UPDATE contacts 
      SET lastInteractionAt = datetime('now', 'localtime') 
      WHERE id = ?
    `).run(contactId);

    const created = db.prepare('SELECT * FROM messages WHERE id = ?').get(insert.lastInsertRowid);

    return NextResponse.json({
      message: created,
      sendResult
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
