'use client';

import React, { useEffect, useState, useRef, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  Search,
  Bot,
  UserCheck,
  Clock,
  Send,
  FileText,
  MapPin,
  Dog,
  ShieldAlert,
  ArrowLeft,
  RefreshCw,
  Sparkles,
  PhoneCall,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';
import { formatPhoneNumber } from '@/lib/phone';

interface Contact {
  id: number;
  phone: string;
  name: string | null;
  category: string;
  status: string;
  aiActive: number;
  blocked: number;
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
}

interface Message {
  id: number;
  contactId: number;
  sender: 'user' | 'assistant' | 'human';
  content: string;
  mediaUrl: string | null;
  createdAt: string;
}

export default function ConversasPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400 text-xs">Carregando central de conversas...</div>}>
      <ConversasContent />
    </Suspense>
  );
}

function ConversasContent() {
  const searchParams = useSearchParams();
  const initialContactId = searchParams.get('contactId');

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [loadingChat, setLoadingChat] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [filterStatus, setFilterStatus] = useState<string>('todos');
  const [inputText, setInputText] = useState<string>('');
  const [sendingMessage, setSendingMessage] = useState<boolean>(false);

  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadContactsList();
    const interval = setInterval(loadContactsList, 8000);
    return () => clearInterval(interval);
  }, [search, filterStatus]);

  useEffect(() => {
    if (selectedContact) {
      loadChatMessages(selectedContact.id);
      const interval = setInterval(() => loadChatMessages(selectedContact.id, false), 5000);
      return () => clearInterval(interval);
    }
  }, [selectedContact?.id]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function loadContactsList() {
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (filterStatus !== 'todos') params.set('status', filterStatus);

      const res = await fetch(`/api/contacts?${params.toString()}`);
      const data = await res.json();
      if (data?.contacts) {
        setContacts(data.contacts);

        // Se tínhamos um contactId na URL e ainda não selecionamos
        if (initialContactId && !selectedContact) {
          const found = data.contacts.find((c: Contact) => c.id === parseInt(initialContactId, 10));
          if (found) setSelectedContact(found);
        } else if (!selectedContact && data.contacts.length > 0) {
          setSelectedContact(data.contacts[0]);
        } else if (selectedContact) {
          // Atualizar dados do contato selecionado se mudaram
          const current = data.contacts.find((c: Contact) => c.id === selectedContact.id);
          if (current) setSelectedContact(current);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingList(false);
    }
  }

  async function loadChatMessages(contactId: number, showLoading = true) {
    try {
      if (showLoading) setLoadingChat(true);
      const res = await fetch(`/api/conversations/${contactId}/messages`);
      const data = await res.json();
      if (data?.messages) {
        setMessages(data.messages);
      }
      if (data?.contact) {
        setSelectedContact(data.contact);
      }
    } catch (e) {
      console.error(e);
    } finally {
      if (showLoading) setLoadingChat(false);
    }
  }

  async function handleAssumeAttendance() {
    if (!selectedContact) return;
    try {
      const res = await fetch(`/api/contacts/${selectedContact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'assume' })
      });
      if (res.ok) {
        loadContactsList();
        loadChatMessages(selectedContact.id, false);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleReturnToAi() {
    if (!selectedContact) return;
    try {
      const res = await fetch(`/api/contacts/${selectedContact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'return_to_ai' })
      });
      if (res.ok) {
        loadContactsList();
        loadChatMessages(selectedContact.id, false);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedContact || !inputText.trim() || sendingMessage) return;

    try {
      setSendingMessage(true);
      const res = await fetch(`/api/conversations/${selectedContact.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: inputText.trim() })
      });
      if (res.ok) {
        setInputText('');
        loadChatMessages(selectedContact.id, false);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleSendManualPdf(type: 'pdf_cuiaba' | 'pdf_vg' | 'pdf_online') {
    if (!selectedContact) return;
    try {
      setSendingMessage(true);
      await fetch(`/api/conversations/${selectedContact.id}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mediaType: type })
      });
      loadChatMessages(selectedContact.id, false);
    } catch (e) {
      console.error(e);
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleUpdateCategory(newCategory: string) {
    if (!selectedContact) return;
    try {
      const res = await fetch(`/api/contacts/${selectedContact.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: newCategory })
      });
      if (res.ok) {
        loadContactsList();
        loadChatMessages(selectedContact.id, false);
      }
    } catch (e) {
      console.error(e);
    }
  }

  return (
    <div className="flex h-full w-full overflow-hidden bg-slate-950">
      {/* Coluna 1: Lista de Contatos / Atendimentos */}
      <div className="w-80 border-r border-slate-800 bg-slate-900 flex flex-col shrink-0">
        {/* Topo da lista */}
        <div className="p-4 border-b border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-bold text-white text-base tracking-tight">
              Atendimentos
            </h2>
            <button
              onClick={loadContactsList}
              className="p-1 rounded text-slate-400 hover:text-slate-200 transition"
              title="Atualizar lista"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {/* Busca */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por telefone ou nome..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-850 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
            />
          </div>

          {/* Filtros de Status */}
          <div className="flex items-center space-x-1 overflow-x-auto pb-1 text-[11px]">
            <button
              onClick={() => setFilterStatus('todos')}
              className={`px-2.5 py-1 rounded-full whitespace-nowrap font-medium transition ${
                filterStatus === 'todos'
                  ? 'bg-slate-700 text-white'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              Todos
            </button>
            <button
              onClick={() => setFilterStatus('aguardando_humano')}
              className={`px-2.5 py-1 rounded-full whitespace-nowrap font-medium transition ${
                filterStatus === 'aguardando_humano'
                  ? 'bg-amber-500 text-slate-950 font-bold'
                  : 'text-amber-400/80 hover:text-amber-300'
              }`}
            >
              Aguardando
            </button>
            <button
              onClick={() => setFilterStatus('em_atendimento_ia')}
              className={`px-2.5 py-1 rounded-full whitespace-nowrap font-medium transition ${
                filterStatus === 'em_atendimento_ia'
                  ? 'bg-emerald-600 text-white font-bold'
                  : 'text-emerald-400/80 hover:text-emerald-300'
              }`}
            >
              Na IA
            </button>
            <button
              onClick={() => setFilterStatus('atendimento_humano')}
              className={`px-2.5 py-1 rounded-full whitespace-nowrap font-medium transition ${
                filterStatus === 'atendimento_humano'
                  ? 'bg-purple-600 text-white font-bold'
                  : 'text-purple-400/80 hover:text-purple-300'
              }`}
            >
              Humano
            </button>
          </div>
        </div>

        {/* Lista com Scroll */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-800/40">
          {contacts.length === 0 ? (
            <div className="p-6 text-center text-xs text-slate-500">
              Nenhuma conversa encontrada neste filtro.
            </div>
          ) : (
            contacts.map((c) => {
              const isSelected = selectedContact?.id === c.id;
              const isWaitingHuman = c.status === 'aguardando_humano';
              const isAi = c.aiActive === 1;

              return (
                <div
                  key={c.id}
                  onClick={() => setSelectedContact(c)}
                  className={`p-3.5 cursor-pointer transition select-none ${
                    isSelected
                      ? 'bg-slate-800/90 border-l-4 border-emerald-500'
                      : 'hover:bg-slate-850/60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-semibold text-white text-xs truncate max-w-[150px]">
                      {c.name || formatPhoneNumber(c.phone)}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {c.lastInteractionAt ? c.lastInteractionAt.split(' ')[1]?.substring(0, 5) : ''}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 truncate max-w-[160px]">
                      {formatPhoneNumber(c.phone)}
                    </span>

                    {/* Badge de status */}
                    {isWaitingHuman ? (
                      <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
                        Aguardando
                      </span>
                    ) : isAi ? (
                      <span className="flex items-center space-x-1 text-emerald-400 text-[10px] font-medium">
                        <Bot className="w-3 h-3" />
                        <span>IA</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 text-[10px]">Humano</span>
                    )}
                  </div>

                  {c.city && (
                    <div className="flex items-center space-x-1 text-[10px] text-slate-400 mt-1">
                      <MapPin className="w-2.5 h-2.5 text-emerald-400" />
                      <span>{c.city}</span>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Coluna 2: Chat Central (WhatsApp) */}
      <div className="flex-1 flex flex-col bg-slate-900/60 min-w-0">
        {selectedContact ? (
          <>
            {/* Header do Chat */}
            <div className="p-3.5 px-5 border-b border-slate-800 bg-slate-900 flex items-center justify-between shrink-0">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center text-slate-200 font-bold text-sm border border-slate-700">
                  {selectedContact.name ? selectedContact.name[0].toUpperCase() : '🐾'}
                </div>
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="font-bold text-sm text-white">
                      {selectedContact.name || 'Contato Sem Nome'}
                    </h3>
                    <span className="text-xs text-slate-400">
                      ({formatPhoneNumber(selectedContact.phone)})
                    </span>
                  </div>
                  <div className="flex items-center space-x-2 text-[11px]">
                    <span
                      className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded font-medium ${
                        selectedContact.aiActive === 1
                          ? 'bg-emerald-500/10 text-emerald-400'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          selectedContact.aiActive === 1 ? 'bg-emerald-400' : 'bg-slate-500'
                        }`}
                      />
                      <span>{selectedContact.aiActive === 1 ? 'IA Ativa' : 'IA Desativada'}</span>
                    </span>

                    <span className="text-slate-500">•</span>
                    <span className="text-slate-400 capitalize">
                      {selectedContact.category.replace('_', ' ')}
                    </span>
                  </div>
                </div>
              </div>

              {/* Botões de Ação Imediata no Topo */}
              <div className="flex items-center space-x-2">
                {selectedContact.aiActive === 1 ? (
                  <button
                    onClick={handleAssumeAttendance}
                    className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold shadow-sm transition"
                    title="Desativa a IA e João ou Nicolle assumem"
                  >
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>Assumir Atendimento</span>
                  </button>
                ) : (
                  <button
                    onClick={handleReturnToAi}
                    className="flex items-center space-x-1.5 px-3.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold shadow-sm transition"
                    title="Reativa a IA para este contato"
                  >
                    <Bot className="w-3.5 h-3.5" />
                    <span>Devolver para IA</span>
                  </button>
                )}
              </div>
            </div>

            {/* Banner de Aviso de Atendimento */}
            {selectedContact.status === 'aguardando_humano' && (
              <div className="bg-amber-500/10 border-b border-amber-500/20 px-5 py-2 flex items-center justify-between text-xs text-amber-300">
                <div className="flex items-center space-x-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                  <span>
                    Material oficial já enviado pela IA. Este lead aguarda continuidade do atendimento humano.
                  </span>
                </div>
                {selectedContact.aiActive === 1 && (
                  <button
                    onClick={handleAssumeAttendance}
                    className="underline font-bold text-amber-200 hover:text-white"
                  >
                    Assumir Agora
                  </button>
                )}
              </div>
            )}

            {/* Histórico de Mensagens com Scroll */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3.5 bg-slate-950/40">
              {messages.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-slate-500 text-xs space-y-2">
                  <Sparkles className="w-6 h-6 text-slate-600" />
                  <span>Nenhuma mensagem registrada nesta conversa ainda.</span>
                </div>
              ) : (
                messages.map((m) => {
                  const isUser = m.sender === 'user';
                  const isAssistant = m.sender === 'assistant';
                  const isHuman = m.sender === 'human';

                  return (
                    <div
                      key={m.id}
                      className={`flex flex-col ${
                        isUser ? 'items-start' : 'items-end'
                      }`}
                    >
                      {/* Remetente Tag */}
                      <span className="text-[10px] text-slate-400 mb-1 px-1">
                        {isUser
                          ? selectedContact.name || 'Tutor'
                          : isAssistant
                          ? '🤖 IA SPE'
                          : '👤 Humano (Equipe SPE)'}
                      </span>

                      {/* Balão */}
                      <div
                        className={`max-w-[75%] rounded-2xl px-4 py-2.5 text-xs leading-relaxed whitespace-pre-wrap shadow-sm ${
                          isUser
                            ? 'bg-slate-800 text-slate-100 rounded-tl-xs border border-slate-700/60'
                            : isAssistant
                            ? 'bg-emerald-800/80 text-white rounded-tr-xs border border-emerald-700/60'
                            : 'bg-purple-800/80 text-white rounded-tr-xs border border-purple-700/60'
                        }`}
                      >
                        {m.content}
                        {m.mediaUrl && (
                          <div className="mt-2 pt-2 border-t border-white/20 text-[11px] flex items-center space-x-1.5">
                            <FileText className="w-3.5 h-3.5 text-white/80" />
                            <a
                              href={m.mediaUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="underline text-white font-medium hover:text-white/80"
                            >
                              Ver Material PDF Enviado
                            </a>
                          </div>
                        )}
                      </div>

                      <span className="text-[9px] text-slate-400 mt-1 px-1">
                        {m.createdAt ? m.createdAt.split(' ')[1]?.substring(0, 5) : ''}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Barra Inferior: Envio de Mensagem e Ações Rápidas */}
            <div className="p-3.5 bg-slate-900 border-t border-slate-800 space-y-2.5 shrink-0">
              {/* Envio de PDFs Rápido */}
              <div className="flex items-center space-x-2 text-[11px] overflow-x-auto pb-1 text-slate-400">
                <span className="font-semibold text-slate-300">Enviar Material:</span>
                <button
                  type="button"
                  onClick={() => handleSendManualPdf('pdf_cuiaba')}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  📄 PDF Cuiabá
                </button>
                <button
                  type="button"
                  onClick={() => handleSendManualPdf('pdf_vg')}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  📄 PDF Várzea Grande
                </button>
                <button
                  type="button"
                  onClick={() => handleSendManualPdf('pdf_online')}
                  className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition"
                >
                  📄 PDF Online
                </button>
              </div>

              {/* Input Form */}
              <form onSubmit={handleSendMessage} className="flex items-center space-x-2">
                <input
                  type="text"
                  placeholder={
                    selectedContact.aiActive === 1
                      ? 'Escreva uma mensagem humana pelo WhatsApp (a IA será notificada)...'
                      : 'Digite sua mensagem para o tutor no WhatsApp...'
                  }
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  className="flex-1 px-4 py-2.5 bg-slate-850 border border-slate-700 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 transition"
                />
                <button
                  type="submit"
                  disabled={sendingMessage || !inputText.trim()}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold flex items-center space-x-1.5 transition disabled:opacity-50 shadow-sm"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>Enviar</span>
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex flex-col items-center justify-center text-slate-500 text-xs">
            Selecione uma conversa à esquerda para visualizar o atendimento.
          </div>
        )}
      </div>

      {/* Coluna 3: Painel Lateral do Lead (Dados Extraídos pela IA) */}
      {selectedContact && (
        <div className="w-80 border-l border-slate-800 bg-slate-900 p-5 overflow-y-auto space-y-5 shrink-0 text-xs text-slate-300">
          <div className="pb-3 border-b border-slate-800">
            <h4 className="font-bold text-white text-sm">Dados do Lead</h4>
            <p className="text-[11px] text-slate-400">Informações identificadas no fluxo</p>
          </div>

          {/* Cidade e Modalidade */}
          <div className="space-y-2 p-3.5 rounded-xl bg-slate-850 border border-slate-800">
            <div className="flex items-center space-x-2 font-semibold text-slate-200">
              <MapPin className="w-4 h-4 text-emerald-400" />
              <span>Cidade & Modalidade</span>
            </div>
            <div className="text-xs font-medium text-white pl-6">
              {selectedContact.city || 'Não identificada ainda'}
            </div>
            <div className="text-[11px] text-slate-400 pl-6">
              {selectedContact.modality || 'Aguardando definição'}
            </div>
          </div>

          {/* Dados do Cão */}
          <div className="space-y-2 p-3.5 rounded-xl bg-slate-850 border border-slate-800">
            <div className="flex items-center space-x-2 font-semibold text-slate-200">
              <Dog className="w-4 h-4 text-amber-400" />
              <span>Informações do Pet</span>
            </div>
            <div className="pl-6 space-y-1 text-[11px]">
              <div>
                <span className="text-slate-400">Nome: </span>
                <strong className="text-white">{selectedContact.dogName || '-'}</strong>
              </div>
              <div>
                <span className="text-slate-400">Raça: </span>
                <strong className="text-white">{selectedContact.dogBreed || '-'}</strong>
              </div>
              <div>
                <span className="text-slate-400">Idade: </span>
                <strong className="text-white">{selectedContact.dogAge || '-'}</strong>
              </div>
            </div>
          </div>

          {/* Comportamento Relatado */}
          <div className="space-y-1.5 p-3.5 rounded-xl bg-slate-850 border border-slate-800">
            <div className="font-semibold text-slate-200">Comportamento Relatado:</div>
            <p className="text-[11px] text-slate-300 leading-relaxed italic bg-slate-900/60 p-2 rounded border border-slate-800">
              {selectedContact.behaviorSummary || 'O tutor ainda não detalhou a queixa principal.'}
            </p>
          </div>

          {/* Etapa do Funil SPE */}
          <div className="space-y-1 p-3.5 rounded-xl bg-slate-850 border border-slate-800">
            <div className="font-semibold text-slate-200">Etapa do Atendimento:</div>
            <div className="text-xs font-bold text-emerald-400 capitalize">
              {selectedContact.step.replace('_', ' ')}
            </div>
          </div>

          {/* Categoria do Contato com Troca Rápida */}
          <div className="space-y-1.5 p-3.5 rounded-xl bg-slate-850 border border-slate-800">
            <div className="font-semibold text-slate-200">Classificação do Contato:</div>
            <select
              value={selectedContact.category}
              onChange={(e) => handleUpdateCategory(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg p-2 text-xs text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="novo_lead">Novo Lead</option>
              <option value="aluno">Aluno Atual (Bloqueia IA)</option>
              <option value="ex_aluno">Ex Aluno (Bloqueia IA)</option>
              <option value="cliente">Cliente Antigo (Bloqueia IA)</option>
              <option value="equipe">Equipe Interna (Bloqueia IA)</option>
              <option value="pessoal">Pessoal (Bloqueia IA)</option>
              <option value="parceiro">Parceiro (Bloqueia IA)</option>
              <option value="fornecedor">Fornecedor (Bloqueia IA)</option>
              <option value="nao_responder">Não Responder (Bloqueia IA)</option>
            </select>
            <p className="text-[10px] text-slate-400">
              Se marcado como aluno ou equipe, a proteção determinística silencia a IA automaticamente.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
