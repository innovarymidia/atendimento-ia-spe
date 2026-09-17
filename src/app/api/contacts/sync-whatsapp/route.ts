import { NextResponse } from 'next/server';
import { queryOne, executeRun } from '@/lib/db';
import { cleanPhoneNumber } from '@/lib/phone';
import { fetchWhatsAppContacts, fetchWhatsAppChats } from '@/lib/evolution';

export async function POST() {
  try {
    const [contactsList, chatsList] = await Promise.all([
      fetchWhatsAppContacts(),
      fetchWhatsAppChats()
    ]);

    let importedCount = 0;
    let updatedCount = 0;

    const processedPhones = new Set<string>();

    // 1. Processar conversas ativas primeiro (têm histórico recente)
    for (const chat of chatsList) {
      if (chat.isGroup) continue;

      let jid = chat.remoteJid || '';
      // Se for @lid, checar remoteJidAlt
      if (jid.includes('@lid') && chat.lastMessage?.key?.remoteJidAlt) {
        jid = chat.lastMessage.key.remoteJidAlt;
      }

      if (jid.includes('@g.us') || jid.includes('status@broadcast')) continue;

      const cleanPhone = cleanPhoneNumber(jid);
      if (!cleanPhone || cleanPhone.length < 10) continue;
      if (processedPhones.has(cleanPhone)) continue;
      processedPhones.add(cleanPhone);

      const pushName = chat.pushName && chat.pushName !== '.' ? chat.pushName : null;

      const existing = await queryOne<{ id: number; name: string | null }>(
        'SELECT id, name FROM contacts WHERE phone = ?',
        [cleanPhone]
      );

      if (!existing) {
        await executeRun(`
          INSERT INTO contacts (
            phone, name, category, status, aiActive, blocked, step, lastInteractionAt
          ) VALUES (?, ?, 'novo_lead', 'novo_lead', 1, 0, 'novo_lead', CURRENT_TIMESTAMP)
          ON CONFLICT (phone) DO NOTHING
        `, [cleanPhone, pushName]);
        importedCount++;
      } else if (pushName && (!existing.name || existing.name === 'Desconhecido')) {
        await executeRun(
          'UPDATE contacts SET name = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
          [pushName, existing.id]
        );
        updatedCount++;
      }
    }

    // 2. Processar lista completa de contatos salvos no WhatsApp
    for (const c of contactsList) {
      if (c.isGroup) continue;
      const jid = c.remoteJid || '';
      if (jid.includes('@g.us') || jid.includes('status@broadcast') || jid.includes('@lid')) continue;

      const cleanPhone = cleanPhoneNumber(jid);
      if (!cleanPhone || cleanPhone.length < 10) continue;
      if (processedPhones.has(cleanPhone)) continue;
      processedPhones.add(cleanPhone);

      const name = c.pushName || c.name || null;

      const existing = await queryOne<{ id: number; name: string | null }>(
        'SELECT id, name FROM contacts WHERE phone = ?',
        [cleanPhone]
      );

      if (!existing) {
        await executeRun(`
          INSERT INTO contacts (
            phone, name, category, status, aiActive, blocked, step, lastInteractionAt
          ) VALUES (?, ?, 'novo_lead', 'novo_lead', 1, 0, 'novo_lead', CURRENT_TIMESTAMP)
          ON CONFLICT (phone) DO NOTHING
        `, [cleanPhone, name]);
        importedCount++;
      } else if (name && (!existing.name || existing.name === 'Desconhecido')) {
        await executeRun(
          'UPDATE contacts SET name = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
          [name, existing.id]
        );
        updatedCount++;
      }
    }

    return NextResponse.json({
      success: true,
      importedCount,
      updatedCount,
      totalFromWhatsApp: processedPhones.size
    });
  } catch (error: any) {
    console.error('Erro na sincronização de contatos do WhatsApp:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

