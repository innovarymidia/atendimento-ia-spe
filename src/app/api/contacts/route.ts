import { NextRequest, NextResponse } from 'next/server';
import { getDb, Contact } from '@/lib/db';
import { cleanPhoneNumber } from '@/lib/phone';

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const searchParams = req.nextUrl.searchParams;
    const search = searchParams.get('search')?.trim();
    const category = searchParams.get('category')?.trim();
    const status = searchParams.get('status')?.trim();
    const onlyExcluded = searchParams.get('onlyExcluded') === 'true';

    let query = 'SELECT * FROM contacts WHERE 1=1';
    const params: any[] = [];

    if (onlyExcluded) {
      query += " AND (category IN ('aluno', 'ex_aluno', 'cliente', 'ex_cliente', 'equipe', 'parceiro', 'fornecedor', 'pessoal', 'nao_responder', 'bloqueado') OR blocked = 1 OR aiActive = 0)";
    }

    if (category) {
      query += ' AND category = ?';
      params.push(category);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    if (search) {
      query += ' AND (phone LIKE ? OR name LIKE ? OR dogName LIKE ? OR city LIKE ?)';
      const term = `%${search}%`;
      params.push(term, term, term, term);
    }

    query += ' ORDER BY lastInteractionAt DESC, id DESC';

    const contacts = db.prepare(query).all(...params) as Contact[];

    return NextResponse.json({ contacts });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();

    const rawPhone = body.phone || '';
    const cleanPhone = cleanPhoneNumber(rawPhone);
    if (!cleanPhone) {
      return NextResponse.json({ error: 'Número de telefone inválido' }, { status: 400 });
    }

    const name = body.name?.trim() || null;
    const category = body.category?.trim() || 'nao_responder';
    const blocked = body.blocked ? 1 : 0;
    const notes = body.notes?.trim() || null;

    // Se a categoria for excluída ou o contato for bloqueado, aiActive deve ser 0
    const isExcludedCategory = [
      'aluno', 'ex_aluno', 'cliente', 'ex_cliente', 'equipe',
      'parceiro', 'fornecedor', 'pessoal', 'nao_responder', 'bloqueado'
    ].includes(category);

    const aiActive = isExcludedCategory || blocked ? 0 : 1;
    const status = blocked ? 'bloqueado' : isExcludedCategory ? category : 'novo_lead';

    const existing = db.prepare('SELECT id FROM contacts WHERE phone = ?').get(cleanPhone) as { id: number } | undefined;

    if (existing) {
      db.prepare(`
        UPDATE contacts 
        SET name = COALESCE(?, name),
            category = ?,
            status = ?,
            aiActive = ?,
            blocked = ?,
            notes = COALESCE(?, notes),
            updatedAt = datetime('now', 'localtime')
        WHERE id = ?
      `).run(name, category, status, aiActive, blocked, notes, existing.id);

      const updated = db.prepare('SELECT * FROM contacts WHERE id = ?').get(existing.id);
      return NextResponse.json({ contact: updated, message: 'Contato atualizado com sucesso' });
    }

    const insert = db.prepare(`
      INSERT INTO contacts (
        phone, name, category, status, aiActive, blocked, notes, lastInteractionAt
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime'))
    `).run(cleanPhone, name, category, status, aiActive, blocked, notes);

    const created = db.prepare('SELECT * FROM contacts WHERE id = ?').get(insert.lastInsertRowid);
    return NextResponse.json({ contact: created, message: 'Contato cadastrado com sucesso' }, { status: 201 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
