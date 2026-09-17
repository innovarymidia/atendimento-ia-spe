import { NextRequest, NextResponse } from 'next/server';
import { getDb, Contact } from '@/lib/db';
import { assumeAttendance, returnToAi } from '@/lib/guardrail';

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

    return NextResponse.json({ contact });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PATCH(
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
    const db = getDb();

    // Ação expressa: Assumir atendimento manualmente (João ou Nicolle)
    if (body.action === 'assume') {
      assumeAttendance(contactId);
      const updated = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
      return NextResponse.json({ contact: updated, message: 'Atendimento assumido pelo atendente humano com sucesso. IA desativada.' });
    }

    // Ação expressa: Devolver para a IA
    if (body.action === 'return_to_ai') {
      returnToAi(contactId);
      const updated = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
      return NextResponse.json({ contact: updated, message: 'Conversa devolvida para a IA com sucesso.' });
    }

    // Atualização genérica de campos
    const existing = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId) as Contact | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'Contato não encontrado' }, { status: 404 });
    }

    const name = body.name !== undefined ? body.name : existing.name;
    const category = body.category !== undefined ? body.category : existing.category;
    const status = body.status !== undefined ? body.status : existing.status;
    const aiActive = body.aiActive !== undefined ? (body.aiActive ? 1 : 0) : existing.aiActive;
    const blocked = body.blocked !== undefined ? (body.blocked ? 1 : 0) : existing.blocked;
    const city = body.city !== undefined ? body.city : existing.city;
    const modality = body.modality !== undefined ? body.modality : existing.modality;
    const dogName = body.dogName !== undefined ? body.dogName : existing.dogName;
    const dogBreed = body.dogBreed !== undefined ? body.dogBreed : existing.dogBreed;
    const dogAge = body.dogAge !== undefined ? body.dogAge : existing.dogAge;
    const behaviorSummary = body.behaviorSummary !== undefined ? body.behaviorSummary : existing.behaviorSummary;
    const step = body.step !== undefined ? body.step : existing.step;
    const notes = body.notes !== undefined ? body.notes : existing.notes;

    db.prepare(`
      UPDATE contacts 
      SET name = ?,
          category = ?,
          status = ?,
          aiActive = ?,
          blocked = ?,
          city = ?,
          modality = ?,
          dogName = ?,
          dogBreed = ?,
          dogAge = ?,
          behaviorSummary = ?,
          step = ?,
          notes = ?,
          updatedAt = datetime('now', 'localtime')
      WHERE id = ?
    `).run(
      name, category, status, aiActive, blocked, city, modality,
      dogName, dogBreed, dogAge, behaviorSummary, step, notes,
      contactId
    );

    const updated = db.prepare('SELECT * FROM contacts WHERE id = ?').get(contactId);
    return NextResponse.json({ contact: updated, message: 'Contato atualizado com sucesso' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(
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
    db.prepare('DELETE FROM contacts WHERE id = ?').run(contactId);

    return NextResponse.json({ success: true, message: 'Contato removido com sucesso' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
