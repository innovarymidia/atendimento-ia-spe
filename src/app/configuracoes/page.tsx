"use client";

import { useEffect, useState } from "react";

export default function ConfiguracoesPage() {
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const loadSettings = async () => {
    try {
      const res = await fetch("/api/settings");
      const data = await res.json();
      if (data.success) {
        setSettings(data.settings);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg("");
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings }),
      });
      if (res.ok) {
        setSuccessMsg("Configurações salvas com sucesso!");
        setTimeout(() => setSuccessMsg(""), 4000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-500">Carregando configurações...</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-4xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Configurações do Sistema</h2>
        <p className="text-sm text-slate-500">
          Gerenciamento de parâmetros do buffer e regras de encaminhamento
        </p>
      </div>

      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-700 text-sm rounded-xl font-medium">
          ✅ {successMsg}
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-6 bg-white p-6 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
            Tempo do Buffer de Mensagens (ms) - MESSAGE_BUFFER_DELAY_MS
          </label>
          <span className="text-xs text-slate-400 block mb-2">
            Tempo de espera após uma mensagem do cliente antes de disparar o processamento do lote pela IA.
          </span>
          <input
            type="number"
            value={settings.MESSAGE_BUFFER_DELAY_MS || "4000"}
            onChange={(e) =>
              setSettings({ ...settings, MESSAGE_BUFFER_DELAY_MS: e.target.value })
            }
            className="w-full max-w-xs px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          />
        </div>

        <div className="pt-4 border-t border-slate-100">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
            Redirecionamento Automático de Alunos e Ex-Alunos
          </label>
          <span className="text-xs text-slate-400 block mb-2">
            Quando um contato marcado como ALUNO ou EX_ALUNO enviar mensagem, enviar resposta padrão de encaminhamento e transferir para atendimento humano.
          </span>
          <select
            value={settings.ENABLE_STUDENT_AUTO_REDIRECT || "true"}
            onChange={(e) =>
              setSettings({ ...settings, ENABLE_STUDENT_AUTO_REDIRECT: e.target.value })
            }
            className="px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          >
            <option value="true">Habilitado (Recomendado)</option>
            <option value="false">Desabilitado (Silenciar sem mensagem)</option>
          </select>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
            Mensagem Padrão de Encaminhamento de Alunos
          </label>
          <span className="text-xs text-slate-400 block mb-2">
            Texto enviado automaticamente para contatos ALUNO ou EX_ALUNO.
          </span>
          <textarea
            rows={3}
            value={settings.STUDENT_REDIRECT_MESSAGE || ""}
            onChange={(e) =>
              setSettings({ ...settings, STUDENT_REDIRECT_MESSAGE: e.target.value })
            }
            className="w-full px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white"
          />
        </div>

        <div className="pt-4">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors shadow-xs"
          >
            {saving ? "Salvando..." : "Salvar Configurações"}
          </button>
        </div>
      </form>
    </div>
  );
}
