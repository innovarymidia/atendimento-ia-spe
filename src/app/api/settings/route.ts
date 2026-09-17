import { NextRequest, NextResponse } from 'next/server';
import { checkEvolutionConnection } from '@/lib/evolution';
import { getAllSettings, saveAllSettings } from '@/lib/settings-sync';
import { isUsingPostgres } from '@/lib/db';

export async function GET() {
  try {
    const settings = await getAllSettings();
    const evoStatus = await checkEvolutionConnection();

    return NextResponse.json({
      settings,
      evolutionStatus: evoStatus,
      storage: {
        isPostgres: isUsingPostgres(),
        type: isUsingPostgres() ? 'Vercel Postgres (Neon)' : 'SQLite Local'
      }
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    const allowedKeys = [
      'globalAiEnabled',
      'geminiApiKey',
      'pdfCuiabaUrl',
      'pdfVgUrl',
      'pdfOnlineUrl',
      'evolutionInstance',
      'evolutionUrl',
      'evolutionApiKey'
    ];

    const updates: Record<string, string> = {};
    for (const key of allowedKeys) {
      if (body[key] !== undefined) {
        updates[key] = String(body[key]);
      }
    }

    // Salva no banco de dados (Postgres ou SQLite) e tenta sincronizar no .env
    await saveAllSettings(updates);

    const updatedSettings = await getAllSettings();

    return NextResponse.json({
      success: true,
      message: isUsingPostgres()
        ? '✓ Configurações salvas permanentemente no Vercel Postgres com sucesso!'
        : '✓ Configurações salvas no banco de dados e sincronizadas!',
      settings: updatedSettings,
      storage: {
        isPostgres: isUsingPostgres(),
        type: isUsingPostgres() ? 'Vercel Postgres (Neon)' : 'SQLite Local'
      }
    });
  } catch (error: any) {
    console.error('Erro ao salvar settings:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
