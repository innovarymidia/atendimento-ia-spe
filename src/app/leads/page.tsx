"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

interface Contact {
  id: string;
  phone: string;
  name: string | null;
  status: string;
  dog_name: string | null;
  dog_age: string | null;
  city: string | null;
  automatic_service_enabled: boolean;
  updated_at: string;
  conversations: { id: string; status: string }[];
}

export default function LeadsPage() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchTerm, setSearchTerm] = useState("");

  const loadContacts = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);
      if (searchTerm) params.append("search", searchTerm);

      const res = await fetch(`/api/contacts?${params.toString()}`);
      const data = await res.json();
      if (data.success) {
        setContacts(data.contacts);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadContacts();
  }, [statusFilter, searchTerm]);

  const handleStatusChange = async (contactId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/contacts/${contactId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        loadContacts();
      }
    } catch (e) {
      console.error(e);
    }
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden p-8">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Leads e Contatos</h2>
          <p className="text-sm text-slate-500">
            Gerenciamento completo dos contatos, status de matrícula e dados do cão
          </p>
        </div>

        {/* Filtros */}
        <div className="flex gap-3">
          <input
            type="text"
            placeholder="Buscar por nome, cão ou fone..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white w-64 focus:outline-hidden focus:ring-2 focus:ring-emerald-500"
          />

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-emerald-500 font-medium"
          >
            <option value="">Todos os Status</option>
            <option value="NOVO_LEAD">NOVO_LEAD</option>
            <option value="ALUNO">ALUNO</option>
            <option value="EX_ALUNO">EX_ALUNO</option>
            <option value="BLOQUEADO">BLOQUEADO</option>
          </select>
        </div>
      </div>

      {/* Tabela de Contatos */}
      <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
        <div className="overflow-y-auto flex-1">
          <table className="w-full text-left text-sm text-slate-600">
            <thead className="bg-slate-50 text-xs uppercase font-semibold text-slate-400 border-b border-slate-100 sticky top-0">
              <tr>
                <th className="py-3.5 px-5">Tutor / Telefone</th>
                <th className="py-3.5 px-5">Cão</th>
                <th className="py-3.5 px-5">Cidade</th>
                <th className="py-3.5 px-5">Status do Contato</th>
                <th className="py-3.5 px-5">Atendimento</th>
                <th className="py-3.5 px-5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {contacts.map((contact) => {
                const conv = contact.conversations[0];
                return (
                  <tr key={contact.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-4 px-5">
                      <Link
                        href={`/leads/${contact.id}`}
                        className="font-semibold text-slate-800 hover:text-emerald-600 block"
                      >
                        {contact.name || "Sem nome cadastrado"}
                      </Link>
                      <span className="text-xs text-slate-400">{contact.phone}</span>
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
                        <span className="text-xs text-slate-400">-</span>
                      )}
                    </td>
                    <td className="py-4 px-5">
                      <span className="text-xs text-slate-600">{contact.city || "-"}</span>
                    </td>
                    <td className="py-4 px-5">
                      <select
                        value={contact.status}
                        onChange={(e) => handleStatusChange(contact.id, e.target.value)}
                        className={`text-xs font-semibold px-2 py-1 rounded-md border ${
                          contact.status === "NOVO_LEAD"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : contact.status === "ALUNO"
                            ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                            : contact.status === "EX_ALUNO"
                            ? "bg-amber-50 text-amber-700 border-amber-200"
                            : "bg-red-50 text-red-700 border-red-200"
                        }`}
                      >
                        <option value="NOVO_LEAD">NOVO_LEAD</option>
                        <option value="ALUNO">ALUNO</option>
                        <option value="EX_ALUNO">EX_ALUNO</option>
                        <option value="BLOQUEADO">BLOQUEADO</option>
                      </select>
                    </td>
                    <td className="py-4 px-5">
                      <span
                        className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                          conv?.status === "HUMAN_ACTIVE" ? "text-amber-600" : "text-emerald-600"
                        }`}
                      >
                        <span
                          className={`w-2 h-2 rounded-full ${
                            conv?.status === "HUMAN_ACTIVE" ? "bg-amber-500" : "bg-emerald-500"
                          }`}
                        ></span>
                        {conv?.status === "HUMAN_ACTIVE" ? "Atendente" : "IA Ativa"}
                      </span>
                    </td>
                    <td className="py-4 px-5 text-right space-x-2">
                      <Link
                        href={`/leads/${contact.id}`}
                        className="px-3 py-1.5 text-xs font-medium text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors"
                      >
                        Detalhes
                      </Link>
                      {conv && (
                        <Link
                          href={`/conversas?id=${conv.id}`}
                          className="px-3 py-1.5 text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-md transition-colors"
                        >
                          Chat
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
              {contacts.length === 0 && !loading && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400 text-sm">
                    Nenhum contato encontrado com os filtros selecionados.
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
