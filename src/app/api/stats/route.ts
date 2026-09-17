import { NextResponse } from 'next/server';
import { getDb, Contact } from '@/lib/db';
import { checkEvolutionConnection } from '@/lib/evolution';

export async function GET() {
  try {
    const db = getDb();

    // Contagens por status e categoria
    const totalLeads = (db.prepare("SELECT COUNT(*) as count FROM contacts WHERE category = 'novo_lead'").get() as any)?.count || 0;
    const emAtendimentoIa = (db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'em_atendimento_ia' AND aiActive = 1").get() as any)?.count || 0;
    const aguardandoHumano = (db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'aguardando_humano'").get() as any)?.count || 0;
    const atendimentoHumano = (db.prepare("SELECT COUNT(*) as count FROM contacts WHERE status = 'atendimento_humano'").get() as any)?.count || 0;
    const contatosExcluidos = (db.prepare(`
      SELECT COUNT(*) as count FROM contacts 
      WHERE category IN ('aluno', 'ex_aluno', 'cliente', 'ex_cliente', 'equipe', 'parceiro', 'fornecedor', 'pessoal', 'nao_responder', 'bloqueado')
         OR blocked = 1
    `).get() as any)?.count || 0;

    const pdfsEnviados = (db.prepare("SELECT COUNT(*) as count FROM contacts WHERE pdfSent = 1").get() as any)?.count || 0;

    // Obter IA global
    const globalSetting = db.prepare("SELECT value FROM settings WHERE key = 'globalAiEnabled'").get() as { value: string } | undefined;
    const globalAiEnabled = globalSetting?.value === 'true';

    // Últimos contatos
    const recentContacts = db.prepare(`
      SELECT * FROM contacts ORDER BY lastInteractionAt DESC LIMIT 10
    `).all() as Contact[];

    // Status da conexão
    const evoStatus = await checkEvolutionConnection();

    return NextResponse.json({
      stats: {
        totalLeads,
        emAtendimentoIa,
        aguardandoHumano,
        atendimentoHumano,
        contatosExcluidos,
        pdfsEnviados,
        globalAiEnabled
      },
      recentContacts,
      evolutionStatus: evoStatus
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
