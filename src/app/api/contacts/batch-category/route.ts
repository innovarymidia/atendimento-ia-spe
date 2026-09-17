import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { FORBIDDEN_CATEGORIES } from '@/lib/guardrail';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const ids: number[] = Array.isArray(body.ids) ? body.ids : [];
    const category: string = body.category || 'novo_lead';
    const explicitBlocked: boolean = Boolean(body.blocked);

    if (ids.length === 0) {
      return NextResponse.json({ error: 'Nenhum contato selecionado' }, { status: 400 });
    }

    const isExcluded = FORBIDDEN_CATEGORIES.has(category.toLowerCase().trim()) || explicitBlocked;
    const aiActive = isExcluded ? 0 : 1;
    const blocked = explicitBlocked || category === 'bloqueado' ? 1 : 0;
    const status = category === 'bloqueado' ? 'bloqueado' : isExcluded ? category : 'novo_lead';

    const db = getDb();
    const placeholders = ids.map(() => '?').join(',');

    db.prepare(`
      UPDATE contacts 
      SET category = ?,
          status = ?,
          aiActive = ?,
          blocked = ?,
          updatedAt = datetime('now', 'localtime')
      WHERE id IN (${placeholders})
    `).run(category, status, aiActive, blocked, ...ids);

    return NextResponse.json({
      success: true,
      updatedCount: ids.length,
      category,
      aiActive
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
