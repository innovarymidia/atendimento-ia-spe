import Link from "next/link";
import { prisma } from "@/lib/db";
import { ContactStatus, ConversationStatus } from "@prisma/client";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [
    totalLeads,
    novosLeads,
    alunos,
    humanActiveCount,
    totalMessages,
    recentContacts,
  ] = await Promise.all([
    prisma.contact.count(),
    prisma.contact.count({ where: { status: ContactStatus.NOVO_LEAD } }),
    prisma.contact.count({ where: { status: ContactStatus.ALUNO } }),
    prisma.conversation.count({ where: { status: ConversationStatus.HUMAN_ACTIVE } }),
    prisma.message.count(),
    prisma.contact.findMany({
      orderBy: { updated_at: "desc" },
      take: 6,
      include: {
        conversations: {
          take: 1,
          orderBy: { updated_at: "desc" },
        },
      },
    }),
  ]);

  return (
    <div className="flex-1 overflow-y-auto p-8">
      <div className="mb-8">
        <h2 className="text-2xl font-bold text-slate-800">Painel Operacional</h2>
        <p className="text-sm text-slate-500">
          Visão geral do atendimento automatizado e leads da SPE
        </p>
      </div>

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-5 mb-8">
        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
            Total de Contatos
          </span>
          <div className="text-3xl font-extrabold text-slate-800 mt-2">{totalLeads}</div>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-blue-500 uppercase tracking-wider">
            Novos Leads (IA)
          </span>
          <div className="text-3xl font-extrabold text-blue-600 mt-2">{novosLeads}</div>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-amber-500 uppercase tracking-wider">
            Aguardando Humano
          </span>
          <div className="text-3xl font-extrabold text-amber-600 mt-2">{humanActiveCount}</div>
        </div>

        <div className="p-5 bg-white rounded-xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-emerald-500 uppercase tracking-wider">
            Alunos Cadastrados
          </span>
          <div className="text-3xl font-extrabold text-emerald-600 mt-2">{alunos}</div>
        </div>
      </div>

      {/* Tabela de Leads Recentes */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="p-5 border-b border-slate-100 flex justify-between items-center">
          <h3 className="font-bold text-slate-800">Contatos e Leads Recentes</h3>
          <Link
            href="/leads"
            className="text-xs font-semibold text-emerald-600 hover:text-emerald-700"
          >
            Ver todos os leads &rarr;
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-400 border-b border-slate-100">
              <tr>
                <th className="py-3 px-5">Telefone / Nome</th>
                <th className="py-3 px-5">Cão</th>
                <th className="py-3 px-5">Status Contato</th>
                <th className="py-3 px-5">Atendimento</th>
                <th className="py-3 px-5 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {recentContacts.map((contact) => {
                const conv = contact.conversations[0];
                return (
                  <tr key={contact.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-4 px-5">
                      <div className="font-semibold text-slate-800">
                        {contact.name || "Lead sem nome"}
                      </div>
                      <div className="text-xs text-slate-400">{contact.phone}</div>
                    </td>
                    <td className="py-4 px-5">
                      {contact.dog_name ? (
                        <div>
                          <span className="font-medium text-slate-700">{contact.dog_name}</span>
                          {contact.dog_age && (
                            <span className="text-xs text-slate-400 block">{contact.dog_age}</span>
                          )}
                        </div>
                      ) : (
                        <span className="text-slate-400 text-xs">Não informado</span>
                      )}
                    </td>
                    <td className="py-4 px-5">
                      <span
                        className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${
                          contact.status === ContactStatus.NOVO_LEAD
                            ? "bg-blue-50 text-blue-700 border border-blue-200"
                            : contact.status === ContactStatus.ALUNO
                            ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                            : contact.status === ContactStatus.EX_ALUNO
                            ? "bg-amber-50 text-amber-700 border border-amber-200"
                            : "bg-red-50 text-red-700 border border-red-200"
                        }`}
                      >
                        {contact.status}
                      </span>
                    </td>
                    <td className="py-4 px-5">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                          conv?.status === ConversationStatus.HUMAN_ACTIVE
                            ? "text-amber-600"
                            : "text-emerald-600"
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            conv?.status === ConversationStatus.HUMAN_ACTIVE
                              ? "bg-amber-500"
                              : "bg-emerald-500"
                          }`}
                        ></span>
                        {conv?.status === ConversationStatus.HUMAN_ACTIVE
                          ? "Atendente Humano"
                          : "IA Ativa"}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-right">
                      {conv && (
                        <Link
                          href={`/conversas?id=${conv.id}`}
                          className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
                        >
                          Abrir Conversa
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
              {recentContacts.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 text-sm">
                    Nenhum contato registrado ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
