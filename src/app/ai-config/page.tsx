"use client";

import { useEffect, useState } from "react";

export default function AiConfigPage() {
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMsg, setSuccessMsg] = useState("");

  const loadConfig = async () => {
    try {
      const res = await fetch("/api/ai-config");
      const data = await res.json();
      if (data.success && data.config) {
        setConfig(data.config);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSuccessMsg("");
    try {
      const res = await fetch("/api/ai-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });
      if (res.ok) {
        setSuccessMsg("Instruções da IA atualizadas com sucesso!");
        setTimeout(() => setSuccessMsg(""), 4000);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-slate-500">Carregando parâmetros da IA...</div>;
  }

  return (
    <div className="flex-1 overflow-y-auto p-8 max-w-4xl">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-slate-800">Configuração da IA (Gemini)</h2>
        <p className="text-sm text-slate-500">
          Ajuste do system prompt, persona de atendimento, modelo e hiperparâmetros
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
            Modelo do Gemini
          </label>
          <select
            value={config?.model || "gemini-3.6-flash"}
            onChange={(e) => setConfig({ ...config, model: e.target.value })}
            className="w-full max-w-xs px-3.5 py-2 text-sm border border-slate-300 rounded-lg bg-white font-medium"
          >
            <option value="gemini-3.6-flash">gemini-3.6-flash (Recomendado - Ultra rápido)</option>
            <option value="gemini-3.7-flash">gemini-3.7-flash</option>
            <option value="gemini-3.8-flash">gemini-3.8-flash</option>
            <option value="gemini-flash-latest">gemini-flash-latest</option>
            <option value="gemini-2.5-pro">gemini-2.5-pro</option>
          </select>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
              Temperatura ({config?.temperature || 0.7})
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={config?.temperature || 0.7}
              onChange={(e) => setConfig({ ...config, temperature: parseFloat(e.target.value) })}
              className="w-full"
            />
            <span className="text-[11px] text-slate-400">
              0.0 = Mais determinístico | 1.0 = Mais criativo
            </span>
          </div>

          <div>
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
              Tokens Máximos de Saída
            </label>
            <input
              type="number"
              value={config?.max_tokens || 800}
              onChange={(e) => setConfig({ ...config, max_tokens: parseInt(e.target.value) })}
              className="w-full px-3.5 py-1.5 text-sm border border-slate-300 rounded-lg bg-white"
            />
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100">
          <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1">
            System Prompt (Instruções da Assistente Virtual)
          </label>
          <span className="text-xs text-slate-400 block mb-2">
            Regras de conduta, persona, restrições rígidas (sem emojis, sem &quot;—&quot;, sem diagnósticos) e formato de saída.
          </span>
          <textarea
            rows={14}
            value={config?.system_prompt || ""}
            onChange={(e) => setConfig({ ...config, system_prompt: e.target.value })}
            className="w-full font-mono text-xs p-4 border border-slate-300 rounded-xl bg-slate-50 leading-relaxed text-slate-800"
          />
        </div>

        <div className="pt-2">
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-semibold rounded-xl transition-colors shadow-xs"
          >
            {saving ? "Salvando..." : "Salvar Configurações da IA"}
          </button>
        </div>
      </form>
    </div>
  );
}
