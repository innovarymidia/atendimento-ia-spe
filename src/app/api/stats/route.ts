import { NextResponse } from 'next/server';
import { Contact, queryOne, queryAll } from '@/lib/db';
import { checkEvolutionConnection } from '@/lib/evolution';

export async function GET() {
  try {
    // Contagens por status e categoria
    const totalLeadsRow = await queryOne<{ count: number | string }>("SELECT COUNT(*) as count FROM contacts WHERE category = 'novo_lead'");
    const totalLeads = Number(totalLeadsRow?.count || 0);

    const emAtendimentoIaRow = await queryOne<{ count: number | string }>("SELECT COUNT(*) as count FROM contacts WHERE status = 'em_atendimento_ia' AND aiActive = 1");
    const emAtendimentoIa = Number(emAtendimentoIaRow?.count || 0);

    const aguardandoHumanoRow = await queryOne<{ count: number | string }>("SELECT COUNT(*) as count FROM contacts WHERE status = 'aguardando_humano'");
    const aguardandoHumano = Number(aguardandoHumanoRow?.count || 0);

    const atendimentoHumanoRow = await queryOne<{ count: number | string }>("SELECT COUNT(*) as count FROM contacts WHERE status = 'atendimento_humano'");
    const atendimentoHumano = Number(atendimentoHumanoRow?.count || 0);

    const contatosExcluidosRow = await queryOne<{ count: number | string }>(`
      SELECT COUNT(*) as count FROM contacts 
      WHERE category IN ('aluno', 'ex_aluno', 'cliente', 'ex_cliente', 'equipe', 'parceiro', 'fornecedor', 'pessoal', 'nao_responder', 'bloqueado')
         OR blocked = 1
    `);
    const contatosExcluidos = Number(contatosExcluidosRow?.count || 0);

    const pdfsEnviadosRow = await queryOne<{ count: number | string }>("SELECT COUNT(*) as count FROM contacts WHERE pdfSent = 1");
    const pdfsEnviados = Number(pdfsEnviadosRow?.count || 0);

    // Obter IA global
    const globalSetting = await queryOne<{ value: string }>("SELECT value FROM settings WHERE key = 'globalAiEnabled'");
    const globalAiEnabled = globalSetting?.value === 'true';

    // Últimos contatos
    const recentContacts = await queryAll<Contact>(`
      SELECT * FROM contacts ORDER BY lastInteractionAt DESC LIMIT 10
    `);

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

