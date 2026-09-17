import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import { checkEvolutionConnection } from '@/lib/evolution';

export async function GET() {
  try {
    const db = getDb();
    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    
    const settings: Record<string, string> = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }

    // Checar conexão com a Evolution API em segundo plano
    const evoStatus = await checkEvolutionConnection();

    return NextResponse.json({
      settings,
      evolutionStatus: evoStatus
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const db = getDb();

    const allowedKeys = [
      'globalAiEnabled',
      'pdfCuiabaUrl',
      'pdfVgUrl',
      'pdfOnlineUrl',
      'evolutionInstance',
      'evolutionUrl',
      'evolutionApiKey'
    ];

    const updateStmt = db.prepare(`
      INSERT INTO settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);

    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        updateStmt.run(key, String(body[key]));
      }
    }

    const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
    const settings: Record<string, string> = {};
    for (const r of rows) {
      settings[r.key] = r.value;
    }

    return NextResponse.json({
      success: true,
      message: 'Configurações atualizadas com sucesso',
      settings
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
