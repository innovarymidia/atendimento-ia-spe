import fs from 'fs';
import path from 'path';
import { getDb } from './db';

const ENV_FILE_PATH = path.resolve(process.cwd(), '.env');

/**
 * Lê o arquivo .env e retorna um dicionário chave-valor
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
        // Remover aspas simples ou duplas
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.substring(1, val.length - 1);
        }
        result[key] = val;
      }
    }
    return result;
  } catch (error) {
    console.error('Erro ao ler .env:', error);
    return {};
  }
}

/**
 * Atualiza o arquivo .env no disco preservando comentários e outras variáveis
 */
export function writeEnvFile(updates: Record<string, string>): void {
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

    // Adicionar chaves que não existiam no .env
    for (const [key, val] of Object.entries(updates)) {
      if (!processedKeys.has(key)) {
        newLines.push(`${key}="${val}"`);
      }
    }

    fs.writeFileSync(ENV_FILE_PATH, newLines.join('\n'), 'utf-8');

    // Atualizar process.env em tempo de execução
    for (const [k, v] of Object.entries(updates)) {
      process.env[k] = v;
    }
  } catch (error) {
    console.error('Erro ao salvar no .env:', error);
  }
}

/**
 * Sincroniza configurações entre o banco de dados e o arquivo .env
 */
export function saveAllSettings(settings: Record<string, string>): void {
  const db = getDb();
  const upsert = db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `);

  for (const [key, val] of Object.entries(settings)) {
    if (val !== undefined && val !== null) {
      upsert.run(key, String(val));
    }
  }

  // Mapear campos do sistema para variáveis de ambiente correspondentes
  const envUpdates: Record<string, string> = {};

  if (settings.geminiApiKey) {
    envUpdates.GEMINI_API_KEY = settings.geminiApiKey;
  }
  if (settings.evolutionUrl) {
    envUpdates.EVOLUTION_API_URL = settings.evolutionUrl;
  }
  if (settings.evolutionApiKey) {
    envUpdates.EVOLUTION_API_KEY = settings.evolutionApiKey;
  }
  if (settings.evolutionInstance) {
    envUpdates.EVOLUTION_INSTANCE_NAME = settings.evolutionInstance;
  }

  if (Object.keys(envUpdates).length > 0) {
    writeEnvFile(envUpdates);
  }
}

/**
 * Lê todas as configurações mesclando banco SQLite e .env
 */
export function getAllSettings(): Record<string, string> {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
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
}
