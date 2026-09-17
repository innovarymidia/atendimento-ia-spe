'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Users,
  Bot,
  UserCheck,
  ShieldBan,
  FileCheck,
  Clock,
  ArrowRight,
  RefreshCw,
  MapPin,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { formatPhoneNumber } from '@/lib/phone';

interface DashboardStats {
  totalLeads: number;
  emAtendimentoIa: number;
  aguardandoHumano: number;
  atendimentoHumano: number;
  contatosExcluidos: number;
  pdfsEnviados: number;
  globalAiEnabled: boolean;
}

interface RecentContact {
  id: number;
  phone: string;
  name: string | null;
  category: string;
  status: string;
  aiActive: number;
  blocked: number;
  city: string | null;
  modality: string | null;
  step: string;
  pdfSent: number;
  lastInteractionAt: string;
}

export default function DashboardPage() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [contacts, setContacts] = useState<RecentContact[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [evolutionStatus, setEvolutionStatus] = useState<any>(null);

  useEffect(() => {
    loadData();
    const timer = setInterval(loadData, 10000);
    return () => clearInterval(timer);
  }, []);

  async function loadData() {
    try {
      const res = await fetch('/api/stats');
      const data = await res.json();
      if (data?.stats) {
        setStats(data.stats);
      }
      if (data?.recentContacts) {
        setContacts(data.recentContacts);
      }
      if (data?.evolutionStatus) {
        setEvolutionStatus(data.evolutionStatus);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleAssume(contactId: number) {
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assume' })
      });
      if (res.ok) {
        loadData();
      }
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="p-8 space-y-8 max-w-7xl mx-auto w-full">
      {/* Top Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Painel de Atendimento
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              Seu Pet Equilibrado
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Primeiro atendimento automatizado com transferência obrigatória para João Eduardo e Nicolle
          </p>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={loadData}
            className="flex items-center space-x-2 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition border border-slate-700"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            <span>Atualizar</span>
          </button>
          <Link
            href="/conversas"
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-semibold shadow-sm transition"
          >
            <span>Ver Conversas ao Vivo</span>
            <ArrowRight className="w-4 h-4" />
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
        {/* Total Leads */}
        <div className="bg-slate-850 p-4 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Novos Leads</span>
            <Users className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-white">
            {stats?.totalLeads ?? 0}
          </div>
          <div className="text-[11px] text-slate-400">Contatos em triagem inicial</div>
        </div>

        {/* Em Atendimento IA */}
        <div className="bg-slate-850 p-4 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Atendimento IA</span>
            <Bot className="w-4 h-4 text-emerald-400 animate-pulse" />
          </div>
          <div className="text-2xl font-bold text-emerald-400">
            {stats?.emAtendimentoIa ?? 0}
          </div>
          <div className="text-[11px] text-slate-400">Conversas ativas com a IA</div>
        </div>

        {/* Aguardando Humano */}
        <div className="bg-slate-850 p-4 rounded-xl border border-slate-800 space-y-2 relative overflow-hidden">
          {stats && stats.aguardandoHumano > 0 && (
            <div className="absolute top-0 right-0 w-2 h-2 rounded-bl bg-amber-400" />
          )}
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Aguardando Humano</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400">
            {stats?.aguardandoHumano ?? 0}
          </div>
          <div className="text-[11px] text-slate-400">PDF enviado / transferidos</div>
        </div>

        {/* Atendimento Humano */}
        <div className="bg-slate-850 p-4 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Com a Equipe</span>
            <UserCheck className="w-4 h-4 text-purple-400" />
          </div>
          <div className="text-2xl font-bold text-purple-400">
            {stats?.atendimentoHumano ?? 0}
          </div>
          <div className="text-[11px] text-slate-400">João ou Nicolle assumiram</div>
        </div>

        {/* Contatos Excluídos / Bloqueados */}
        <div className="bg-slate-850 p-4 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">Excluídos da IA</span>
            <ShieldBan className="w-4 h-4 text-red-400" />
          </div>
          <div className="text-2xl font-bold text-red-400">
            {stats?.contatosExcluidos ?? 0}
          </div>
          <div className="text-[11px] text-slate-400">Alunos, equipe, bloqueios</div>
        </div>

        {/* PDFs Enviados */}
        <div className="bg-slate-850 p-4 rounded-xl border border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-slate-400">
            <span className="text-xs font-medium">PDFs Enviados</span>
            <FileCheck className="w-4 h-4 text-teal-400" />
          </div>
          <div className="text-2xl font-bold text-teal-400">
            {stats?.pdfsEnviados ?? 0}
          </div>
          <div className="text-[11px] text-slate-400">Cuiabá, VG e Online</div>
        </div>
      </div>

      {/* Regra de Prioridade Determinística Info Banner */}
      <div className="rounded-xl p-5 bg-gradient-to-r from-slate-900 via-slate-850 to-slate-900 border border-slate-800 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="text-sm font-semibold text-white">
              Camada de Proteção Determinística Ativa
            </span>
          </div>
          <p className="text-xs text-slate-400 max-w-2xl leading-relaxed">
            A IA atende estritamente novos leads. Contatos marcados como alunos, ex-alunos, equipe, parceiros ou bloqueados têm silêncio absoluto pré-determinado sem chamar o modelo.
          </p>
        </div>

        <Link
          href="/contatos-excluidos"
          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-200 border border-slate-700 transition whitespace-nowrap"
        >
          Gerenciar Contatos Excluídos
        </Link>
      </div>

      {/* Recent Leads Table */}
      <div className="bg-slate-850 rounded-xl border border-slate-800 overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div>
            <h2 className="text-base font-semibold text-white">Atendimentos Recentes</h2>
            <p className="text-xs text-slate-400">Histórico mais recente de interações e transferências</p>
          </div>
          <Link
            href="/conversas"
            className="text-xs font-semibold text-emerald-400 hover:text-emerald-300 flex items-center space-x-1"
          >
            <span>Abrir Central de Chat</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/60 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-5 py-3">Contato</th>
                <th className="px-5 py-3">Categoria</th>
                <th className="px-5 py-3">Cidade / Modalidade</th>
                <th className="px-5 py-3">Status do Lead</th>
                <th className="px-5 py-3">Status da IA</th>
                <th className="px-5 py-3">PDF</th>
                <th className="px-5 py-3 text-right">Ação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {contacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-10 text-slate-500">
                    Nenhum contato registrado até o momento. As conversas que chegarem no WhatsApp aparecerão aqui em tempo real.
                  </td>
                </tr>
              ) : (
                contacts.map((c) => {
                  const isBlocked = c.blocked === 1 || c.aiActive === 0;
                  return (
                    <tr key={c.id} className="hover:bg-slate-800/40 transition">
                      <td className="px-5 py-3.5">
                        <div className="font-medium text-white">{c.name || 'Desconhecido'}</div>
                        <div className="text-[11px] text-slate-400">{formatPhoneNumber(c.phone)}</div>
                      </td>

                      <td className="px-5 py-3.5">
                        <span className="capitalize px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700/60 text-[11px]">
                          {c.category.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="px-5 py-3.5">
                        {c.city ? (
                          <div className="flex items-center space-x-1.5 text-slate-300">
                            <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                            <span>{c.city}</span>
                          </div>
                        ) : (
                          <span className="text-slate-500 italic">Ainda não informada</span>
                        )}
                        {c.modality && (
                          <div className="text-[10px] text-slate-400 mt-0.5">{c.modality}</div>
                        )}
                      </td>

                      <td className="px-5 py-3.5">
                        <span
                          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            c.status === 'aguardando_humano'
                              ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 font-semibold'
                              : c.status === 'atendimento_humano'
                              ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                              : c.status === 'em_atendimento_ia'
                              ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                              : 'bg-slate-800 text-slate-400'
                          }`}
                        >
                          {c.status === 'aguardando_humano'
                            ? 'Aguardando Humano'
                            : c.status === 'atendimento_humano'
                            ? 'Humano Assumiu'
                            : c.status === 'em_atendimento_ia'
                            ? 'Em Atendimento IA'
                            : c.status.replace('_', ' ')}
                        </span>
                      </td>

                      <td className="px-5 py-3.5">
                        <span
                          className={`inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[11px] font-semibold ${
                            c.aiActive === 1
                              ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                              : 'bg-slate-800 text-slate-400 border border-slate-700/50'
                          }`}
                        >
                          <span
                            className={`w-1.5 h-1.5 rounded-full ${
                              c.aiActive === 1 ? 'bg-emerald-400' : 'bg-slate-500'
                            }`}
                          />
                          <span>{c.aiActive === 1 ? 'Ativa' : 'Desativada'}</span>
                        </span>
                      </td>

                      <td className="px-5 py-3.5">
                        {c.pdfSent === 1 ? (
                          <span className="text-teal-400 flex items-center space-x-1">
                            <FileCheck className="w-3.5 h-3.5" />
                            <span>Enviado</span>
                          </span>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>

                      <td className="px-5 py-3.5 text-right space-x-2">
                        {c.aiActive === 1 && (
                          <button
                            onClick={() => handleAssume(c.id)}
                            className="px-2.5 py-1 rounded bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-[11px] font-semibold transition"
                            title="Desativa a IA imediatamente e assume o atendimento"
                          >
                            Assumir
                          </button>
                        )}
                        <Link
                          href={`/conversas?contactId=${c.id}`}
                          className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-[11px] font-medium transition inline-block"
                        >
                          Ver Chat
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
