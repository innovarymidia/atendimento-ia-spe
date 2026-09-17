'use client';

import React, { useEffect, useState } from 'react';
import {
  ShieldBan,
  UserPlus,
  Search,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RefreshCw,
  Edit2,
  Trash2,
  Filter,
  CheckSquare,
  Square,
  ArrowRight,
  Download,
  Users,
  Clock,
  Sparkles
} from 'lucide-react';
import { formatPhoneNumber } from '@/lib/phone';

interface ContactItem {
  id: number;
  phone: string;
  name: string | null;
  category: string;
  status: string;
  aiActive: number;
  blocked: number;
  notes: string | null;
  lastInteractionAt: string;
  createdAt: string;
  updatedAt: string;
}

const CATEGORIES = [
  { id: 'aluno', label: 'Aluno Atual (Bloqueia IA)', shortLabel: 'Aluno' },
  { id: 'ex_aluno', label: 'Ex Aluno (Bloqueia IA)', shortLabel: 'Ex Aluno' },
  { id: 'cliente', label: 'Cliente Antigo (Bloqueia IA)', shortLabel: 'Cliente' },
  { id: 'equipe', label: 'Equipe Interna (Bloqueia IA)', shortLabel: 'Equipe' },
  { id: 'pessoal', label: 'Contato Pessoal (Bloqueia IA)', shortLabel: 'Pessoal' },
  { id: 'parceiro', label: 'Parceiro (Bloqueia IA)', shortLabel: 'Parceiro' },
  { id: 'fornecedor', label: 'Fornecedor (Bloqueia IA)', shortLabel: 'Fornecedor' },
  { id: 'nao_responder', label: 'Não Responder (Bloqueia IA)', shortLabel: 'Não Responder' },
  { id: 'bloqueado', label: 'Bloqueado (Bloqueia IA)', shortLabel: 'Bloqueado' },
  { id: 'novo_lead', label: 'Novo Lead (Liberado para IA)', shortLabel: 'Novo Lead' }
];

export default function ContatosExcluidosPage() {
  const [contacts, setContacts] = useState<ContactItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [syncing, setSyncing] = useState<boolean>(false);
  const [syncFeedback, setSyncFeedback] = useState<string>('');
  const [search, setSearch] = useState<string>('');
  
  // Abas de visualização
  // 'todos': todos os contatos
  // 'aguardando': apenas contatos novos que ainda não foram classificados (category = novo_lead)
  // 'excluidos': apenas alunos, equipe, bloqueados (aiActive = 0)
  // 'liberados': apenas novos leads ativos na IA
  const [activeTab, setActiveTab] = useState<'todos' | 'aguardando' | 'excluidos' | 'liberados'>('todos');
  const [filterCategory, setFilterCategory] = useState<string>('todas');

  // Seleção múltipla para classificação em massa
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [batchCategory, setBatchCategory] = useState<string>('aluno');
  const [applyingBatch, setApplyingBatch] = useState<boolean>(false);

  // Modal manual
  const [modalOpen, setModalOpen] = useState<boolean>(false);
  const [editingContact, setEditingContact] = useState<ContactItem | null>(null);
  const [formPhone, setFormPhone] = useState<string>('');
  const [formName, setFormName] = useState<string>('');
  const [formCategory, setFormCategory] = useState<string>('aluno');
  const [formNotes, setFormNotes] = useState<string>('');
  const [formBlocked, setFormBlocked] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);

  useEffect(() => {
    loadContacts();
  }, [search, activeTab, filterCategory]);

  async function loadContacts() {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (search) params.set('search', search);

      if (filterCategory !== 'todas') {
        params.set('category', filterCategory);
      } else if (activeTab === 'aguardando') {
        params.set('category', 'novo_lead');
      } else if (activeTab === 'excluidos') {
        params.set('onlyExcluded', 'true');
      } else if (activeTab === 'liberados') {
        params.set('category', 'novo_lead');
      }

      const res = await fetch(`/api/contacts?${params.toString()}`);
      const data = await res.json();
      if (data?.contacts) {
        let list = data.contacts as ContactItem[];
        if (activeTab === 'liberados') {
          list = list.filter(c => c.aiActive === 1 && c.blocked === 0);
        }
        setContacts(list);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  async function handleSyncWhatsApp() {
    try {
      setSyncing(true);
      setSyncFeedback('');
      const res = await fetch('/api/contacts/sync-whatsapp', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        setSyncFeedback(
          `Sincronização concluída! ${data.importedCount} novos contatos importados e ${data.updatedCount} atualizados do WhatsApp.`
        );
        loadContacts();
        setTimeout(() => setSyncFeedback(''), 6000);
      } else {
        setSyncFeedback('Erro ao sincronizar com WhatsApp: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (e: any) {
      setSyncFeedback('Erro de conexão ao sincronizar: ' + e.message);
    } finally {
      setSyncing(false);
    }
  }

  // Alteração individual rápida de categoria (inline)
  async function handleInlineCategoryChange(contactId: number, newCategory: string) {
    try {
      const isExcluded = newCategory !== 'novo_lead';
      const aiActive = isExcluded ? 0 : 1;
      const blocked = newCategory === 'bloqueado' ? 1 : 0;
      const status = newCategory === 'bloqueado' ? 'bloqueado' : isExcluded ? newCategory : 'novo_lead';

      // Atualização otimista na UI
      setContacts(prev =>
        prev.map(c => (c.id === contactId ? { ...c, category: newCategory, aiActive, blocked, status } : c))
      );

      await fetch(`/api/contacts/${contactId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: newCategory,
          aiActive,
          blocked,
          status
        })
      });
    } catch (e) {
      console.error(e);
      loadContacts();
    }
  }

  // Alternar IA individualmente
  async function handleToggleAi(c: ContactItem) {
    try {
      const nextAiActive = c.aiActive === 1 ? 0 : 1;
      const nextBlocked = nextAiActive === 1 ? 0 : 1;

      setContacts(prev =>
        prev.map(item => (item.id === c.id ? { ...item, aiActive: nextAiActive, blocked: nextBlocked } : item))
      );

      await fetch(`/api/contacts/${c.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          aiActive: nextAiActive,
          blocked: nextBlocked
        })
      });
    } catch (e) {
      console.error(e);
      loadContacts();
    }
  }

  // Seleção múltipla
  function handleSelectAll() {
    if (selectedIds.length === contacts.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(contacts.map(c => c.id));
    }
  }

  function handleToggleSelect(id: number) {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(item => item !== id) : [...prev, id]
    );
  }

  // Aplicar classificação em lote
  async function handleApplyBatchCategory() {
    if (selectedIds.length === 0) return;
    try {
      setApplyingBatch(true);
      const res = await fetch('/api/contacts/batch-category', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: selectedIds,
          category: batchCategory
        })
      });
      if (res.ok) {
        setSelectedIds([]);
        loadContacts();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setApplyingBatch(false);
    }
  }

  // Excluir contato
  async function handleDelete(contactId: number) {
    if (!confirm('Deseja realmente remover este contato do cadastro?')) return;
    try {
      await fetch(`/api/contacts/${contactId}`, { method: 'DELETE' });
      setSelectedIds(prev => prev.filter(id => id !== contactId));
      loadContacts();
    } catch (e) {
      console.error(e);
    }
  }

  // Modal
  function openCreateModal() {
    setEditingContact(null);
    setFormPhone('');
    setFormName('');
    setFormCategory('aluno');
    setFormNotes('');
    setFormBlocked(true);
    setModalOpen(true);
  }

  function openEditModal(c: ContactItem) {
    setEditingContact(c);
    setFormPhone(c.phone);
    setFormName(c.name || '');
    setFormCategory(c.category);
    setFormNotes(c.notes || '');
    setFormBlocked(c.blocked === 1 || c.aiActive === 0);
    setModalOpen(true);
  }

  async function handleSaveContact(e: React.FormEvent) {
    e.preventDefault();
    if (!formPhone.trim()) return;

    try {
      setSaving(true);
      if (editingContact) {
        const isExcluded = formCategory !== 'novo_lead' || formBlocked;
        const res = await fetch(`/api/contacts/${editingContact.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName.trim() || null,
            category: formCategory,
            blocked: formBlocked ? 1 : 0,
            aiActive: isExcluded ? 0 : 1,
            notes: formNotes.trim() || null
          })
        });
        if (res.ok) {
          setModalOpen(false);
          loadContacts();
        }
      } else {
        const res = await fetch('/api/contacts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: formPhone,
            name: formName.trim() || null,
            category: formCategory,
            blocked: formBlocked,
            notes: formNotes.trim() || null
          })
        });
        if (res.ok) {
          setModalOpen(false);
          loadContacts();
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  }

  const allSelected = contacts.length > 0 && selectedIds.length === contacts.length;

  return (
    <div className="p-8 space-y-6 max-w-7xl mx-auto w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 pb-6 border-b border-slate-800">
        <div>
          <div className="flex items-center space-x-3">
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Classificação de Contatos & Exclusões da IA
            </h1>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center space-x-1">
              <ShieldBan className="w-3.5 h-3.5 text-emerald-400" />
              <span>Controle Determinístico</span>
            </span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Veja todos os telefones que entraram em contato no WhatsApp, selecione e atribua a categoria certa (Aluno, Ex aluno, Equipe, Pessoal, etc.)
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Botão Sincronizar WhatsApp */}
          <button
            onClick={handleSyncWhatsApp}
            disabled={syncing}
            className="flex items-center space-x-2 px-4 py-2 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold shadow-sm transition disabled:opacity-50"
            title="Importa todos os números e conversas da instância SPE no WhatsApp"
          >
            <Download className={`w-4 h-4 ${syncing ? 'animate-bounce' : ''}`} />
            <span>{syncing ? 'Importando do WhatsApp...' : 'Sincronizar Contatos do WhatsApp'}</span>
          </button>

          {/* Botão Adicionar Manual */}
          <button
            onClick={openCreateModal}
            className="flex items-center space-x-1.5 px-3.5 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs font-medium transition"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Novo Número</span>
          </button>

          <button
            onClick={loadContacts}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-slate-200 border border-slate-700 transition"
            title="Atualizar lista"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Feedback de Sincronização */}
      {syncFeedback && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center space-x-2">
          <Sparkles className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{syncFeedback}</span>
        </div>
      )}

      {/* Abas de Navegação / Filtragem Rápida */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => { setActiveTab('todos'); setSelectedIds([]); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
              activeTab === 'todos'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-850 text-slate-400 hover:text-slate-200 border border-slate-800'
            }`}
          >
            Todos os Telefones
          </button>

          <button
            onClick={() => { setActiveTab('aguardando'); setSelectedIds([]); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
              activeTab === 'aguardando'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'bg-slate-850 text-amber-400/80 hover:text-amber-300 border border-slate-800'
            }`}
          >
            <Clock className="w-3.5 h-3.5" />
            <span>Novos para Classificar</span>
          </button>

          <button
            onClick={() => { setActiveTab('excluidos'); setSelectedIds([]); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
              activeTab === 'excluidos'
                ? 'bg-red-600 text-white shadow-sm'
                : 'bg-slate-850 text-red-400/80 hover:text-red-300 border border-slate-800'
            }`}
          >
            <ShieldBan className="w-3.5 h-3.5" />
            <span>Excluídos da IA (Bloqueados)</span>
          </button>

          <button
            onClick={() => { setActiveTab('liberados'); setSelectedIds([]); }}
            className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition flex items-center space-x-1.5 ${
              activeTab === 'liberados'
                ? 'bg-teal-600 text-white shadow-sm'
                : 'bg-slate-850 text-teal-400/80 hover:text-teal-300 border border-slate-800'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Liberados para Atendimento IA</span>
          </button>
        </div>

        {/* Categoria Dropdown Específico */}
        <div className="flex items-center space-x-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            value={filterCategory}
            onChange={(e) => { setFilterCategory(e.target.value); setSelectedIds([]); }}
            className="bg-slate-850 border border-slate-800 rounded-lg text-xs text-slate-200 px-3 py-1.5 focus:outline-none focus:border-emerald-500"
          >
            <option value="todas">Filtrar por Categoria Específica</option>
            {CATEGORIES.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Busca */}
      <div className="relative max-w-md">
        <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
        <input
          type="text"
          placeholder="Buscar por telefone (DDD ou dígitos) ou nome do contato..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-4 py-2 bg-slate-850 border border-slate-800 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
        />
      </div>

      {/* Barra de Ação em Massa Flutuante / Fixada quando há seleção */}
      {selectedIds.length > 0 && (
        <div className="p-4 rounded-xl bg-slate-800 border-2 border-emerald-500 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4 animate-in fade-in duration-200">
          <div className="flex items-center space-x-2 text-xs font-semibold text-white">
            <CheckSquare className="w-4 h-4 text-emerald-400" />
            <span>
              {selectedIds.length} telefone(s) selecionado(s). Definir categoria de todos para:
            </span>
          </div>

          <div className="flex items-center space-x-3 w-full md:w-auto">
            <select
              value={batchCategory}
              onChange={(e) => setBatchCategory(e.target.value)}
              className="bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:border-emerald-500 font-medium"
            >
              {CATEGORIES.map(cat => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={handleApplyBatchCategory}
              disabled={applyingBatch}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-sm transition disabled:opacity-50 whitespace-nowrap"
            >
              {applyingBatch ? 'Aplicando...' : 'Aplicar aos Selecionados'}
            </button>

            <button
              type="button"
              onClick={() => setSelectedIds([])}
              className="text-xs text-slate-400 hover:text-slate-200 underline"
            >
              Limpar Seleção
            </button>
          </div>
        </div>
      )}

      {/* Tabela de Contatos com Classificação Inline */}
      <div className="bg-slate-850 rounded-xl border border-slate-800 overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-300">
            <thead className="bg-slate-900/70 text-slate-400 uppercase text-[10px] font-bold tracking-wider border-b border-slate-800">
              <tr>
                <th className="px-4 py-3.5 w-10 text-center">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    title={allSelected ? 'Desmarcar todos' : 'Selecionar todos'}
                    className="text-slate-400 hover:text-white"
                  >
                    {allSelected ? (
                      <CheckSquare className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <Square className="w-4 h-4" />
                    )}
                  </button>
                </th>
                <th className="px-4 py-3.5">Telefone WhatsApp</th>
                <th className="px-4 py-3.5">Nome / Contato</th>
                <th className="px-4 py-3.5">Classificação / Categoria</th>
                <th className="px-4 py-3.5">Status da IA</th>
                <th className="px-4 py-3.5">Última Interação</th>
                <th className="px-4 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {contacts.length === 0 ? (
                <tr>
                  <td colSpan={7} className="text-center py-12 text-slate-500">
                    <div className="space-y-2">
                      <p>Nenhum contato encontrado nesta visualização.</p>
                      <button
                        onClick={handleSyncWhatsApp}
                        className="px-3 py-1.5 rounded bg-emerald-600/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold hover:bg-emerald-600/30 transition inline-block"
                      >
                        Clique para Sincronizar Contatos do WhatsApp
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                contacts.map((c) => {
                  const isSelected = selectedIds.includes(c.id);
                  const isAiBlocked = c.aiActive === 0 || c.blocked === 1;

                  return (
                    <tr
                      key={c.id}
                      className={`hover:bg-slate-800/50 transition ${
                        isSelected ? 'bg-slate-800/80' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="px-4 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(c.id)}
                          className="w-4 h-4 rounded text-emerald-600 bg-slate-900 border-slate-700 focus:ring-emerald-500 cursor-pointer"
                        />
                      </td>

                      {/* Telefone */}
                      <td className="px-4 py-3 font-mono font-medium text-white text-xs">
                        {formatPhoneNumber(c.phone)}
                      </td>

                      {/* Nome */}
                      <td className="px-4 py-3 font-medium text-slate-200">
                        {c.name || <span className="text-slate-500 italic">Sem nome</span>}
                      </td>

                      {/* Classificação com Seletor Inline Direto */}
                      <td className="px-4 py-3">
                        <select
                          value={c.category}
                          onChange={(e) => handleInlineCategoryChange(c.id, e.target.value)}
                          className={`text-xs rounded-lg px-2.5 py-1.5 font-semibold border transition focus:outline-none ${
                            c.category === 'aluno'
                              ? 'bg-blue-500/10 text-blue-300 border-blue-500/30'
                              : c.category === 'ex_aluno'
                              ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                              : c.category === 'equipe'
                              ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
                              : c.category === 'pessoal'
                              ? 'bg-pink-500/10 text-pink-300 border-pink-500/30'
                              : c.category === 'fornecedor' || c.category === 'parceiro'
                              ? 'bg-orange-500/10 text-orange-300 border-orange-500/30'
                              : c.category === 'bloqueado' || c.category === 'nao_responder'
                              ? 'bg-red-500/10 text-red-300 border-red-500/30'
                              : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                          }`}
                        >
                          {CATEGORIES.map((cat) => (
                            <option
                              key={cat.id}
                              value={cat.id}
                              className="bg-slate-900 text-slate-200"
                            >
                              {cat.shortLabel}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Status da IA */}
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => handleToggleAi(c)}
                          title="Clique para alternar o bloqueio da IA"
                          className={`inline-flex items-center space-x-1.5 px-2 py-1 rounded text-[11px] font-semibold transition cursor-pointer ${
                            isAiBlocked
                              ? 'bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/20'
                              : 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20'
                          }`}
                        >
                          {isAiBlocked ? (
                            <>
                              <XCircle className="w-3.5 h-3.5 text-red-400" />
                              <span>Bloqueada</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                              <span>Ativa</span>
                            </>
                          )}
                        </button>
                      </td>

                      {/* Última Interação */}
                      <td className="px-4 py-3 text-[11px] text-slate-400">
                        {c.lastInteractionAt ? c.lastInteractionAt.split(' ')[0] : '-'}
                      </td>

                      {/* Ações */}
                      <td className="px-4 py-3 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => openEditModal(c)}
                          className="p-1 rounded hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition"
                          title="Editar detalhes"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDelete(c.id)}
                          className="p-1 rounded hover:bg-red-900/30 text-slate-400 hover:text-red-400 transition"
                          title="Remover"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Adicionar / Editar Contato Manual */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="text-base font-bold text-white">
                {editingContact ? 'Editar Contato' : 'Adicionar Telefone Manualmente'}
              </h3>
              <button
                onClick={() => setModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveContact} className="space-y-4 text-xs">
              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Telefone / WhatsApp *
                </label>
                <input
                  type="text"
                  required
                  disabled={Boolean(editingContact)}
                  placeholder="Ex: 65 99999-9999 ou 5565999999999"
                  value={formPhone}
                  onChange={(e) => setFormPhone(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-850 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Nome do Contato
                </label>
                <input
                  type="text"
                  placeholder="Ex: Maria (Tutora do Toby), João Eduardo, etc."
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-850 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Categoria *
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-850 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:border-emerald-500 font-medium"
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-300 font-semibold mb-1">
                  Observações Internas (Opcional)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ex: Aluno presencial em Cuiabá, não responder com IA."
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-850 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="pt-2">
                <label className="flex items-center space-x-2 text-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formBlocked}
                    onChange={(e) => setFormBlocked(e.target.checked)}
                    className="w-4 h-4 rounded text-emerald-600 bg-slate-800 border-slate-700 focus:ring-emerald-500"
                  />
                  <span className="font-semibold text-white">
                    Bloquear IA imediatamente para este contato
                  </span>
                </label>
              </div>

              <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="px-5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition shadow-sm"
                >
                  {saving ? 'Salvando...' : 'Salvar Contato'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
