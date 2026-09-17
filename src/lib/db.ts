import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import fs from 'fs';

const globalForDb = globalThis as unknown as {
  dbInstance?: DatabaseSync;
};

export function getDb(): DatabaseSync {
  if (!globalForDb.dbInstance) {
    const dbPath = path.resolve(process.cwd(), 'dev.db');
    const dbDir = path.dirname(dbPath);
    if (!fs.existsSync(dbDir)) {
      fs.mkdirSync(dbDir, { recursive: true });
    }

    globalForDb.dbInstance = new DatabaseSync(dbPath);
    initSchema(globalForDb.dbInstance);
  }
  return globalForDb.dbInstance;
}

function initSchema(db: DatabaseSync) {
  // Ativar foreign keys e WAL mode para garantir flush e concorrência imediata
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
      lastInteractionAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      updatedAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
    CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
    CREATE INDEX IF NOT EXISTS idx_contacts_category ON contacts(category);

    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      contactId INTEGER NOT NULL,
      sender TEXT NOT NULL, -- 'user', 'assistant', 'human'
      content TEXT NOT NULL,
      mediaUrl TEXT,
      createdAt TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
      FOREIGN KEY (contactId) REFERENCES contacts(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_messages_contactId ON messages(contactId);

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );
  `);

  // Configurações padrão
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
