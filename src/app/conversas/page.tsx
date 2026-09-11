"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import { useSearchParams } from "next/navigation";

interface ConversationListItem {
  id: string;
  status: string;
  transfer_reason: string | null;
  updated_at: string;
  contact: {
    id: string;
    phone: string;
    name: string | null;
    status: string;
    dog_name: string | null;
    lead_temperature: string | null;
  };
  messages: {
    id: string;
    content: string;
    created_at: string;
    direction: string;
  }[];
}

export default function ConversasPage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-400 text-sm">Carregando inbox...</div>}>
      <ConversasContent />
    </Suspense>
  );
}

function ConversasContent() {
  const searchParams = useSearchParams();
  const initialId = searchParams.get("id");

  const [conversations, setConversations] = useState<ConversationListItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(initialId);
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [loadingList, setLoadingList] = useState(true);
  const [loadingChat, setLoadingChat] = useState(false);
  const [manualText, setManualText] = useState("");
  const [sending, setSending] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const loadConversations = async () => {
    try {
      const res = await fetch("/api/conversations");
      const data = await res.json();
      if (data.success) {
        setConversations(data.conversations);
        if (!selectedId && data.conversations.length > 0) {
          setSelectedId(data.conversations[0].id);
        }
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingList(false);
    }
  };

  const loadChat = async (id: string) => {
    setLoadingChat(true);
    try {
      const res = await fetch(`/api/conversations/${id}`);
      const data = await res.json();
      if (data.success) {
        setSelectedConversation(data.conversation);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingChat(false);
    }
  };

  useEffect(() => {
    loadConversations();
    const interval = setInterval(loadConversations, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedId) {
      loadChat(selectedId);
    }
  }, [selectedId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [selectedConversation?.messages]);

  const handleTakeover = async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/conversations/${selectedId}/takeover`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "MANUAL_TAKEOVER" }),
      });
      if (res.ok) {
        loadChat(selectedId);
        loadConversations();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleReturnToAi = async () => {
    if (!selectedId) return;
    try {
      const res = await fetch(`/api/conversations/${selectedId}/return-to-ai`, {
        method: "POST",
      });
      if (res.ok) {
        loadChat(selectedId);
        loadConversations();
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedId || !manualText.trim()) return;

    setSending(true);
    try {
      const res = await fetch(`/api/conversations/${selectedId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: manualText.trim() }),
      });
      if (res.ok) {
        setManualText("");
        loadChat(selectedId);
        loadConversations();
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSending(false);
    }
  };

  const handleContactStatusChange = async (newStatus: string) => {
    if (!selectedConversation?.contact?.id) return;
    try {
      const res = await fetch(`/api/contacts/${selectedConversation.contact.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        loadChat(selectedId!);
        loadConversations();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* Coluna da Esquerda: Lista de Conversas */}
      <div className="w-80 border-r border-slate-200 bg-white flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800 text-sm">Inbox de Conversas</h2>
          <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full font-semibold">
            {conversations.length}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {conversations.map((c) => {
            const isSelected = c.id === selectedId;
            const lastMsg = c.messages[0]?.content || "Sem mensagens";
            const time = new Date(c.updated_at).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
            });

            return (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left p-4 transition-colors flex flex-col gap-1.5 ${
                  isSelected ? "bg-emerald-50/70 border-l-4 border-emerald-600" : "hover:bg-slate-50"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="font-semibold text-xs text-slate-800 truncate">
                    {c.contact.name || c.contact.phone}
                  </span>
                  <span className="text-[11px] text-slate-400">{time}</span>
                </div>

                <p className="text-xs text-slate-500 truncate w-full">{lastMsg}</p>

                <div className="flex items-center gap-1.5 mt-1">
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.5 rounded-md ${
                      c.status === "HUMAN_ACTIVE"
                        ? "bg-amber-100 text-amber-800"
                        : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    {c.status === "HUMAN_ACTIVE" ? "HUMANO" : "IA ATIVA"}
                  </span>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded-md">
                    {c.contact.status}
                  </span>
                  {c.contact.dog_name && (
                    <span className="text-[10px] bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded-md">
                      🐕 {c.contact.dog_name}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
          {conversations.length === 0 && !loadingList && (
            <div className="p-8 text-center text-xs text-slate-400">
              Nenhuma conversa registrada.
            </div>
          )}
        </div>
      </div>

      {/* Coluna da Direita: Chat & Detalhes */}
      {selectedConversation ? (
        <div className="flex-1 flex flex-col bg-slate-50 overflow-hidden">
          {/* Header do Chat */}
          <div className="h-16 px-6 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-slate-800 text-sm">
                    {selectedConversation.contact.name || selectedConversation.contact.phone}
                  </h3>
                  <span className="text-xs text-slate-400">
                    ({selectedConversation.contact.phone})
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-slate-500">
                  <span>Cão: <strong>{selectedConversation.contact.dog_name || "Não informado"}</strong></span>
                  {selectedConversation.contact.dog_age && (
                    <span>• {selectedConversation.contact.dog_age}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Controles: Takeover, Status, Return to AI */}
            <div className="flex items-center gap-3">
              {/* Seletor de Status do Contato */}
              <select
                value={selectedConversation.contact.status}
                onChange={(e) => handleContactStatusChange(e.target.value)}
                className="text-xs font-semibold px-2.5 py-1.5 bg-slate-50 border border-slate-300 rounded-lg"
              >
                <option value="NOVO_LEAD">NOVO_LEAD</option>
                <option value="ALUNO">ALUNO</option>
                <option value="EX_ALUNO">EX_ALUNO</option>
                <option value="BLOQUEADO">BLOQUEADO</option>
              </select>

              {selectedConversation.status === "AI_ACTIVE" ? (
                <button
                  onClick={handleTakeover}
                  className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
                >
                  ✋ Assumir Atendimento
                </button>
              ) : (
                <button
                  onClick={handleReturnToAi}
                  className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors shadow-xs"
                >
                  🤖 Devolver para IA
                </button>
              )}
            </div>
          </div>

          {/* Área de Mensagens */}
          <div className="flex-1 overflow-y-auto p-6 space-y-4">
            {selectedConversation.messages.map((m: any) => {
              const isIncoming = m.direction === "INCOMING";
              return (
                <div
                  key={m.id}
                  className={`flex flex-col ${isIncoming ? "items-start" : "items-end"}`}
                >
                  <div
                    className={`max-w-lg rounded-2xl px-4 py-2.5 shadow-xs text-sm ${
                      isIncoming
                        ? "bg-white text-slate-800 border border-slate-200"
                        : m.ai_generated
                        ? "bg-emerald-600 text-white"
                        : "bg-blue-600 text-white"
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{m.content}</p>
                  </div>
                  <div className="flex items-center gap-1.5 mt-1 px-1">
                    <span className="text-[10px] text-slate-400">
                      {new Date(m.created_at).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    {!isIncoming && (
                      <span className="text-[10px] text-slate-400 font-medium">
                        {m.ai_generated ? "• IA" : "• Atendente"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {/* Campo de Envio de Mensagem Manual */}
          <form onSubmit={handleSendMessage} className="p-4 bg-white border-t border-slate-200 flex gap-3">
            <input
              type="text"
              placeholder={
                selectedConversation.status === "HUMAN_ACTIVE"
                  ? "Digite uma mensagem manual (Você está controlando o chat)..."
                  : "Digite para enviar manualmente (Assumirá o controle automático)..."
              }
              value={manualText}
              onChange={(e) => setManualText(e.target.value)}
              className="flex-1 px-4 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
            />
            <button
              type="submit"
              disabled={sending || !manualText.trim()}
              className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors shrink-0 shadow-xs"
            >
              {sending ? "Enviando..." : "Enviar"}
            </button>
          </form>
        </div>
      ) : (
        <div className="flex-1 flex items-center justify-center text-slate-400 text-sm">
          Selecione uma conversa para visualizar o histórico.
        </div>
      )}
    </div>
  );
}
