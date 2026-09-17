import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';
import { neon } from '@neondatabase/serverless';

export type Contact = {
  id: number;
  phone: string;
  name: string | null;
  category: string;
  status: string;
  aiActive: number; // 0 or 1
  blocked: number; // 0 or 1
  city: string | null;
  modality: string | null;
  dogName: string | null;
  dogBreed: string | null;
  dogAge: string | null;
  behaviorSummary: string | null;
  step: string;
  pdfSent: number;
  pdfSentAt: string | null;
  notes: string | null;
  lastInteractionAt: string;
  createdAt: string;
  updatedAt: string;
};

export type Message = {
  id: number;
  contactId: number;
  sender: 'user' | 'assistant' | 'human';
  content: string;
  mediaUrl: string | null;
  createdAt: string;
};

// Verifica se há conexão com PostgreSQL (Vercel Postgres / Neon)
export function getPostgresUrl(): string | null {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL || '';
  if (url.startsWith('postgres://') || url.startsWith('postgresql://')) {
    return url;
  }
  return null;
}

export function isUsingPostgres(): boolean {
  return Boolean(getPostgresUrl());
}

// Global cache para conexões
const globalForDb = globalThis as unknown as {
  sqliteInstance?: DatabaseSync;
  postgresSql?: any;
  schemaInitialized?: boolean;
};

/**
 * Retorna o cliente SQLite local (com fallback seguro para /tmp no Vercel)
 */
function getSqliteDb(): DatabaseSync {
  if (!globalForDb.sqliteInstance) {
    let dbPath = path.resolve(process.cwd(), 'dev.db');

    // No Vercel, o filesystem raiz é estritamente Read-Only. O único caminho gravável é /tmp
    if (process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME) {
      dbPath = path.resolve('/tmp', 'dev.db');
    }

    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      try {
        fs.mkdirSync(dbDir, { recursive: true });
      } catch (e) {
        // Ignora erro se pasta já existir
      }
    }

    globalForDb.sqliteInstance = new DatabaseSync(dbPath);
    initSqliteSchema(globalForDb.sqliteInstance);
  }
  return globalForDb.sqliteInstance;
}

function initSqliteSchema(db: DatabaseSync) {
  db.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;

    CREATE TABLE IF NOT EXISTS contacts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT UNIQUE NOT NULL,
      name TEXT,
      category TEXT NOT NULL DEFAULT 'novo_lead', 
      status TEXT NOT NULL DEFAULT 'novo_lead',
      aiActive INTEGER NOT NULL DEFAULT 1,
      blocked INTEGER NOT NULL DEFAULT 0,
      city TEXT,
      modality TEXT,
      dogName TEXT,
      dogBreed TEXT,
      dogAge TEXT,
      behaviorSummary TEXT,
      step TEXT NOT NULL DEFAULT 'novo_lead',
      pdfSent INTEGER NOT NULL DEFAULT 0,
      pdfSentAt TEXT,
      notes TEXT,
      lastInteractionAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
    CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
    CREATE INDEX IF NOT EXISTS idx_contacts_category ON contacts(category);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contactId INTEGER NOT NULL,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      mediaUrl TEXT,
      createdAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (contactId) REFERENCES contacts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_contactId ON messages(contactId);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const defaultSettings = [
    { key: 'globalAiEnabled', value: 'true' },
    { key: 'geminiApiKey', value: process.env.GEMINI_API_KEY || '' },
    { key: 'pdfCuiabaUrl', value: 'https://seupetequilibrado.com.br/materiais/cuiaba.pdf' },
    { key: 'pdfVgUrl', value: 'https://seupetequilibrado.com.br/materiais/varzea-grande.pdf' },
    { key: 'pdfOnlineUrl', value: 'https://seupetequilibrado.com.br/materiais/online.pdf' },
    { key: 'evolutionInstance', value: process.env.EVOLUTION_INSTANCE_NAME || 'SPE' },
    { key: 'evolutionUrl', value: process.env.EVOLUTION_API_URL || 'https://evolution-api-yweq.onrender.com' },
    { key: 'evolutionApiKey', value: process.env.EVOLUTION_API_KEY || 'Innovary@2026#WhatsAppAPI' }
  ];

  const insertSetting = db.prepare(`
    INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)
  `);

  for (const s of defaultSettings) {
    insertSetting.run(s.key, s.value);
  }
}

/**
 * Inicializa e retorna o cliente Neon Postgres para Vercel
 */
function getPostgresClient() {
  const pgUrl = getPostgresUrl();
  if (!pgUrl) throw new Error('POSTGRES_URL não configurada');
  if (!globalForDb.postgresSql) {
    globalForDb.postgresSql = neon(pgUrl);
  }
  return globalForDb.postgresSql;
}

async function initPostgresSchema(sql: any) {
  if (globalForDb.schemaInitialized) return;

  await sql(`
    CREATE TABLE IF NOT EXISTS contacts (
      id SERIAL PRIMARY KEY,
      phone TEXT UNIQUE NOT NULL,
      name TEXT,
      category TEXT NOT NULL DEFAULT 'novo_lead', 
      status TEXT NOT NULL DEFAULT 'novo_lead',
      aiActive INTEGER NOT NULL DEFAULT 1,
      blocked INTEGER NOT NULL DEFAULT 0,
      city TEXT,
      modality TEXT,
      dogName TEXT,
      dogBreed TEXT,
      dogAge TEXT,
      behaviorSummary TEXT,
      step TEXT NOT NULL DEFAULT 'novo_lead',
      pdfSent INTEGER NOT NULL DEFAULT 0,
      pdfSentAt TEXT,
      notes TEXT,
      lastInteractionAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updatedAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_pg_contacts_phone ON contacts(phone);
    CREATE INDEX IF NOT EXISTS idx_pg_contacts_status ON contacts(status);
    CREATE INDEX IF NOT EXISTS idx_pg_contacts_category ON contacts(category);

    CREATE TABLE IF NOT EXISTS messages (
      id SERIAL PRIMARY KEY,
      contactId INTEGER NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
      sender TEXT NOT NULL,
      content TEXT NOT NULL,
      mediaUrl TEXT,
      createdAt TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_pg_messages_contactId ON messages(contactId);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  const defaultSettings = [
    { key: 'globalAiEnabled', value: 'true' },
    { key: 'geminiApiKey', value: process.env.GEMINI_API_KEY || '' },
    { key: 'pdfCuiabaUrl', value: 'https://seupetequilibrado.com.br/materiais/cuiaba.pdf' },
    { key: 'pdfVgUrl', value: 'https://seupetequilibrado.com.br/materiais/varzea-grande.pdf' },
    { key: 'pdfOnlineUrl', value: 'https://seupetequilibrado.com.br/materiais/online.pdf' },
    { key: 'evolutionInstance', value: process.env.EVOLUTION_INSTANCE_NAME || 'SPE' },
    { key: 'evolutionUrl', value: process.env.EVOLUTION_API_URL || 'https://evolution-api-yweq.onrender.com' },
    { key: 'evolutionApiKey', value: process.env.EVOLUTION_API_KEY || 'Innovary@2026#WhatsAppAPI' }
  ];

  for (const s of defaultSettings) {
    await sql(
      `INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING`,
      [s.key, s.value]
    );
  }

  globalForDb.schemaInitialized = true;
}

/**
 * Utilitário unificado de execução de queries assíncronas
 * Converte automaticamente placeholders '?' para '$1, $2' no PostgreSQL
 */
export async function queryAll<T = any>(sqlQuery: string, params: any[] = []): Promise<T[]> {
  if (isUsingPostgres()) {
    const sql = getPostgresClient();
    await initPostgresSchema(sql);
    let idx = 1;
    const convertedSql = sqlQuery.replace(/\?/g, () => `$${idx++}`);
    const rows = await sql(convertedSql, params);
    return rows as T[];
  } else {
    const db = getSqliteDb();
    const rows = db.prepare(sqlQuery).all(...params);
    return rows as T[];
  }
}

export async function queryOne<T = any>(sqlQuery: string, params: any[] = []): Promise<T | null> {
  const rows = await queryAll<T>(sqlQuery, params);
  return rows.length > 0 ? rows[0] : null;
}

export async function executeRun(sqlQuery: string, params: any[] = []): Promise<{ lastInsertRowid?: number; changes: number }> {
  if (isUsingPostgres()) {
    const sql = getPostgresClient();
    await initPostgresSchema(sql);
    let idx = 1;
    let convertedSql = sqlQuery.replace(/\?/g, () => `$${idx++}`);
    
    // Se for INSERT no postgres e queremos o ID de volta
    if (/^\s*INSERT\s+INTO/i.test(convertedSql) && !/RETURNING/i.test(convertedSql)) {
      convertedSql += ' RETURNING id';
      const res = await sql(convertedSql, params);
      return {
        lastInsertRowid: res[0]?.id ? Number(res[0].id) : undefined,
        changes: res.length
      };
    }

    const res = await sql(convertedSql, params);
    return {
      changes: Array.isArray(res) ? res.length : 1
    };
  } else {
    const db = getSqliteDb();
    const info = db.prepare(sqlQuery).run(...params);
    return {
      lastInsertRowid: info.lastInsertRowid ? Number(info.lastInsertRowid) : undefined,
      changes: Number(info.changes)
    };
  }
}

/**
 * Função de retrocompatibilidade para módulos que usam getDb().prepare(...)
 */
export function getDb(): DatabaseSync {
  return getSqliteDb();
}
