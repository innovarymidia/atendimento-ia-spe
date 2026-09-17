import fs from 'fs';
import path from 'path';
import { queryAll, executeRun, isUsingPostgres } from './db';

const ENV_FILE_PATH = path.resolve(process.cwd(), '.env');

/**
 * Lê o arquivo .env se estiver em ambiente com disco acessível
 */
export function readEnvFile(): Record<string, string> {
  try {
    if (!fs.existsSync(ENV_FILE_PATH)) {
      return {};
    }
    const content = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
    const result: Record<string, string> = {};
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.substring(0, eqIdx).trim();
        let val = trimmed.substring(eqIdx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        result[key] = val;
      }
    }
    return result;
  } catch (error) {
    return {};
  }
}

/**
 * Atualiza o arquivo .env com proteção contra sistemas de arquivos Read-Only (como Vercel)
 */
export function writeEnvFile(updates: Record<string, string>): void {
  // Atualizar process.env em memória imediatamente
  for (const [k, v] of Object.entries(updates)) {
    process.env[k] = v;
  }

  try {
    let content = '';
    if (fs.existsSync(ENV_FILE_PATH)) {
      content = fs.readFileSync(ENV_FILE_PATH, 'utf-8');
    }

    const lines = content.split('\n');
    const processedKeys = new Set<string>();
    const newLines: string[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) {
        newLines.push(line);
        continue;
      }

      const eqIdx = trimmed.indexOf('=');
      if (eqIdx !== -1) {
        const key = trimmed.substring(0, eqIdx).trim();
        if (updates[key] !== undefined) {
          newLines.push(`${key}="${updates[key]}"`);
          processedKeys.add(key);
        } else {
          newLines.push(line);
        }
      } else {
        newLines.push(line);
      }
    }

    for (const [key, val] of Object.entries(updates)) {
      if (!processedKeys.has(key)) {
        newLines.push(`${key}="${val}"`);
      }
    }

    fs.writeFileSync(ENV_FILE_PATH, newLines.join('\n'), 'utf-8');
  } catch (error: any) {
    // No Vercel, o filesystem é Read-Only, então a persistência é garantida no Banco de Dados (Postgres)
    console.warn('Gravação em .env ignorada (sistema de arquivos somente-leitura / Vercel). Configurações persistidas no banco de dados.');
  }
}

/**
 * Salva todas as configurações no Banco de Dados (Postgres ou SQLite) e tenta sincronizar no .env
 */
export async function saveAllSettings(settings: Record<string, string>): Promise<void> {
  for (const [key, val] of Object.entries(settings)) {
    if (val !== undefined && val !== null) {
      await executeRun(`
        INSERT INTO settings (key, value) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET value = EXCLUDED.value
      `, [key, String(val)]);
    }
  }

  // Sincronizar em memória e tentar gravar no .env
  const envUpdates: Record<string, string> = {};
  if (settings.geminiApiKey) envUpdates.GEMINI_API_KEY = settings.geminiApiKey;
  if (settings.evolutionUrl) envUpdates.EVOLUTION_API_URL = settings.evolutionUrl;
  if (settings.evolutionApiKey) envUpdates.EVOLUTION_API_KEY = settings.evolutionApiKey;
  if (settings.evolutionInstance) envUpdates.EVOLUTION_INSTANCE_NAME = settings.evolutionInstance;

  if (Object.keys(envUpdates).length > 0) {
    writeEnvFile(envUpdates);
  }
}

/**
 * Recupera todas as configurações do Banco de Dados (Postgres ou SQLite)
 */
export async function getAllSettings(): Promise<Record<string, string>> {
  try {
    const rows = await queryAll<{ key: string; value: string }>('SELECT key, value FROM settings');
    const dbSettings: Record<string, string> = {};
    for (const r of rows) {
      dbSettings[r.key] = r.value;
    }

    const envValues = readEnvFile();

    return {
      globalAiEnabled: dbSettings.globalAiEnabled ?? 'true',
      geminiApiKey: dbSettings.geminiApiKey || envValues.GEMINI_API_KEY || process.env.GEMINI_API_KEY || '',
      pdfCuiabaUrl: dbSettings.pdfCuiabaUrl || 'https://seupetequilibrado.com.br/materiais/cuiaba.pdf',
      pdfVgUrl: dbSettings.pdfVgUrl || 'https://seupetequilibrado.com.br/materiais/varzea-grande.pdf',
      pdfOnlineUrl: dbSettings.pdfOnlineUrl || 'https://seupetequilibrado.com.br/materiais/online.pdf',
      evolutionUrl: dbSettings.evolutionUrl || envValues.EVOLUTION_API_URL || process.env.EVOLUTION_API_URL || 'https://evolution-api-yweq.onrender.com',
      evolutionApiKey: dbSettings.evolutionApiKey || envValues.EVOLUTION_API_KEY || process.env.EVOLUTION_API_KEY || 'Innovary@2026#WhatsAppAPI',
      evolutionInstance: dbSettings.evolutionInstance || envValues.EVOLUTION_INSTANCE_NAME || process.env.EVOLUTION_INSTANCE_NAME || 'SPE'
    };
  } catch (error) {
    console.error('Erro ao obter configurações:', error);
    return {
      globalAiEnabled: 'true',
      geminiApiKey: process.env.GEMINI_API_KEY || '',
      pdfCuiabaUrl: 'https://seupetequilibrado.com.br/materiais/cuiaba.pdf',
      pdfVgUrl: 'https://seupetequilibrado.com.br/materiais/varzea-grande.pdf',
      pdfOnlineUrl: 'https://seupetequilibrado.com.br/materiais/online.pdf',
      evolutionUrl: process.env.EVOLUTION_API_URL || 'https://evolution-api-yweq.onrender.com',
      evolutionApiKey: process.env.EVOLUTION_API_KEY || 'Innovary@2026#WhatsAppAPI',
      evolutionInstance: process.env.EVOLUTION_INSTANCE_NAME || 'SPE'
    };
  }
}
