"use client";

import { useEffect, useState, use } from "react";
import Link from "next/link";

export default function LeadDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const [contact, setContact] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const loadContact = async () => {
    try {
      const res = await fetch(`/api/contacts/${id}`);
      const data = await res.json();
      if (data.success) {
        setContact(data.contact);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContact();
  }, [id]);

  const updateField = async (field: string, value: any) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/contacts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      if (res.ok) {
        const data = await res.json();
        setContact(data.contact);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-500">Carregando detalhes do lead...</div>;
  }

  if (!contact) {
    return <div className="p-8 text-red-500">Lead não encontrado.</div>;
  }

  const conv = contact.conversations?.[0];

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-5xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/leads" className="text-xs text-slate-400 hover:text-slate-600 mb-2 block">
            &larr; Voltar para Leads
          </Link>
          <h2 className="text-2xl font-bold text-slate-800">
            {contact.name || "Lead sem nome"}
          </h2>
          <span className="text-sm text-slate-500">{contact.phone}</span>
        </div>

        {conv && (
          <Link
            href={`/conversas?id=${conv.id}`}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold transition-colors shadow-xs"
          >
            Abrir Conversa WhatsApp
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        {/* Card 1: Status de Negócio */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Status de Matrícula
          </h3>

          <div>
            <label className="text-xs font-semibold text-slate-500 block mb-1">
              Classificação do Contato
            </label>
            <select
              value={contact.status}
              onChange={(e) => updateField("status", e.target.value)}
              className="w-full text-sm font-semibold p-2 border border-slate-300 rounded-lg bg-white"
            >
              <option value="NOVO_LEAD">NOVO_LEAD (Atendimento Comercial IA)</option>
              <option value="ALUNO">ALUNO (Bloqueado comercialmente)</option>
              <option value="EX_ALUNO">EX_ALUNO (Bloqueado comercialmente)</option>
              <option value="BLOQUEADO">BLOQUEADO (Sem respostas)</option>
            </select>
          </div>

          <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-medium text-slate-600">Automação IA Habilitada:</span>
            <input
              type="checkbox"
              checked={contact.automatic_service_enabled}
              onChange={(e) => updateField("automatic_service_enabled", e.target.checked)}
              className="w-4 h-4 rounded-sm text-emerald-600"
            />
          </div>
        </div>

        {/* Card 2: Dados do Cão */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Dados do Cão
          </h3>

          <div className="space-y-2">
            <div>
              <span className="text-xs text-slate-400 block">Nome do Cão</span>
              <span className="text-sm font-semibold text-slate-700">
                {contact.dog_name || "Não informado"}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block">Idade</span>
              <span className="text-sm font-semibold text-slate-700">
                {contact.dog_age || "Não informada"}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block">Porte / Tamanho</span>
              <span className="text-sm font-semibold text-slate-700">
                {contact.dog_size || "Não informado"}
              </span>
            </div>
            <div>
              <span className="text-xs text-slate-400 block">Cidade</span>
              <span className="text-sm font-semibold text-slate-700">
                {contact.city || "Não informada"}
              </span>
            </div>
          </div>
        </div>

        {/* Card 3: Qualificação */}
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-xs space-y-4">
          <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Qualificação do Lead
          </h3>

          <div>
            <span className="text-xs text-slate-400 block">Temperatura</span>
            <span
              className={`inline-block mt-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                contact.lead_temperature === "hot"
                  ? "bg-red-50 text-red-600 border border-red-200"
                  : contact.lead_temperature === "warm"
                  ? "bg-amber-50 text-amber-600 border border-amber-200"
                  : "bg-blue-50 text-blue-600 border border-blue-200"
              }`}
            >
              {contact.lead_temperature || "warm"}
            </span>
          </div>

          <div>
            <span className="text-xs text-slate-400 block">Etapa da Conversa</span>
            <span className="text-xs font-semibold text-slate-700">
              {contact.conversation_stage || "qualification"}
            </span>
          </div>

          <div>
            <span className="text-xs text-slate-400 block">Problema Principal Relatado</span>
            <p className="text-xs text-slate-600 mt-1 italic">
              {contact.main_problem || "Nenhum problema cadastrado"}
            </p>
          </div>
        </div>
      </div>

      {/* Memória Estruturada Extraída pela IA */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-6">
        <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">
          Memória Estruturada Extraída (LeadData)
        </h3>

        {contact.lead_data && contact.lead_data.length > 0 ? (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {contact.lead_data.map((item: any) => (
              <div key={item.id} className="p-3 bg-slate-50 rounded-lg border border-slate-100">
                <span className="text-[11px] font-bold text-slate-400 uppercase block">
                  {item.field}
                </span>
                <span className="text-xs font-medium text-slate-800 mt-0.5 block">
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-xs text-slate-400">
            Nenhuma informação extraída pelo Gemini ainda nesta conversa.
          </p>
        )}
      </div>
    </div>
  );
}
