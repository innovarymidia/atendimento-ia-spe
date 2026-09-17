import { NextRequest, NextResponse } from 'next/server';
import { checkEvolutionConnection } from '@/lib/evolution';
import { getAllSettings, saveAllSettings } from '@/lib/settings-sync';

export async function GET() {
  try {
    const settings = getAllSettings();
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

    // Salva no SQLite E sincroniza com o arquivo .env
    saveAllSettings(updates);

    const updatedSettings = getAllSettings();

    return NextResponse.json({
      success: true,
      message: 'Configurações salvas e persistidas no banco e no arquivo .env com sucesso!',
      settings: updatedSettings
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
