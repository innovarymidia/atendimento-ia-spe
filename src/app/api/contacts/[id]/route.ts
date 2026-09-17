import { NextRequest, NextResponse } from 'next/server';
import { Contact, queryOne, executeRun } from '@/lib/db';
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

    const contact = await queryOne<Contact>('SELECT * FROM contacts WHERE id = ?', [contactId]);

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

    // Ação expressa: Assumir atendimento manualmente (João ou Nicolle)
    if (body.action === 'assume') {
      await assumeAttendance(contactId);
      const updated = await queryOne<Contact>('SELECT * FROM contacts WHERE id = ?', [contactId]);
      return NextResponse.json({ contact: updated, message: 'Atendimento assumido pelo atendente humano com sucesso. IA desativada.' });
    }

    // Ação expressa: Devolver para a IA
    if (body.action === 'return_to_ai') {
      await returnToAi(contactId);
      const updated = await queryOne<Contact>('SELECT * FROM contacts WHERE id = ?', [contactId]);
      return NextResponse.json({ contact: updated, message: 'Conversa devolvida para a IA com sucesso.' });
    }

    // Atualização genérica de campos
    const existing = await queryOne<Contact>('SELECT * FROM contacts WHERE id = ?', [contactId]);
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

    await executeRun(`
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
          updatedAt = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [
      name, category, status, aiActive, blocked, city, modality,
      dogName, dogBreed, dogAge, behaviorSummary, step, notes,
      contactId
    ]);

    const updated = await queryOne<Contact>('SELECT * FROM contacts WHERE id = ?', [contactId]);
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

    await executeRun('DELETE FROM contacts WHERE id = ?', [contactId]);

    return NextResponse.json({ success: true, message: 'Contato removido com sucesso' });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
