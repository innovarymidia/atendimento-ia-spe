'use client';

import React, { useEffect, useState } from 'react';
import {
  Bot,
  FileText,
  Wifi,
  Copy,
  Check,
  Save,
  RefreshCw,
  Key,
  Eye,
  EyeOff,
  Sparkles,
  ShieldCheck
} from 'lucide-react';

export default function ConfiguracoesPage() {
  const [loading, setLoading] = useState<boolean>(true);
  const [saving, setSaving] = useState<boolean>(false);
  const [testingConnection, setTestingConnection] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [showGeminiKey, setShowGeminiKey] = useState<boolean>(false);
  const [showEvolutionKey, setShowEvolutionKey] = useState<boolean>(false);

  // Formulário de configurações
  const [globalAi, setGlobalAi] = useState<boolean>(true);
  const [geminiApiKey, setGeminiApiKey] = useState<string>('');
  const [pdfCuiaba, setPdfCuiaba] = useState<string>('');
  const [pdfVg, setPdfVg] = useState<string>('');
  const [pdfOnline, setPdfOnline] = useState<string>('');
  const [evolutionUrl, setEvolutionUrl] = useState<string>('');
  const [evolutionApiKey, setEvolutionApiKey] = useState<string>('');
  const [evolutionInstance, setEvolutionInstance] = useState<string>('');
  const [evolutionStatus, setEvolutionStatus] = useState<any>(null);
  const [feedbackMsg, setFeedbackMsg] = useState<string>('');

  const [webhookUrl, setWebhookUrl] = useState<string>('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setWebhookUrl(`${window.location.origin}/api/webhooks/evolution`);
    }
    loadSettings();
  }, []);

  async function loadSettings() {
    try {
      setLoading(true);
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data?.settings) {
        setGlobalAi(data.settings.globalAiEnabled === 'true');
        setGeminiApiKey(data.settings.geminiApiKey || '');
        setPdfCuiaba(data.settings.pdfCuiabaUrl || '');
        setPdfVg(data.settings.pdfVgUrl || '');
        setPdfOnline(data.settings.pdfOnlineUrl || '');
        setEvolutionUrl(data.settings.evolutionUrl || '');
        setEvolutionApiKey(data.settings.evolutionApiKey || '');
        setEvolutionInstance(data.settings.evolutionInstance || '');
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

  async function handleSaveSettings(e: React.FormEvent) {
    e.preventDefault();
    try {
      setSaving(true);
      setFeedbackMsg('');
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          globalAiEnabled: String(globalAi),
          geminiApiKey,
          pdfCuiabaUrl: pdfCuiaba,
          pdfVgUrl: pdfVg,
          pdfOnlineUrl: pdfOnline,
          evolutionUrl,
          evolutionApiKey,
          evolutionInstance
        })
      });
      const data = await res.json();
      if (res.ok) {
        setFeedbackMsg('✓ Configurações salvas e persistidas no banco e no arquivo .env com sucesso!');
        setTimeout(() => setFeedbackMsg(''), 5000);
      } else {
        setFeedbackMsg('Erro ao salvar: ' + (data.error || 'Erro desconhecido'));
      }
    } catch (e) {
      console.error(e);
      setFeedbackMsg('Erro ao salvar configurações.');
    } finally {
      setSaving(false);
    }
  }

  async function testEvolution() {
    try {
      setTestingConnection(true);
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data?.evolutionStatus) {
        setEvolutionStatus(data.evolutionStatus);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTestingConnection(false);
    }
  }

  function copyWebhook() {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }

  return (
    <div className="p-8 space-y-8 max-w-5xl mx-auto w-full">
      {/* Header */}
      <div className="pb-6 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <h1 className="text-2xl font-bold text-white tracking-tight">
            Configurações do Sistema & Integrações
          </h1>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            Persistência Automática
          </span>
        </div>
        <p className="text-sm text-slate-400 mt-1">
          Todas as alterações feitas aqui são gravadas no banco de dados e sincronizadas diretamente no arquivo <code>.env</code>
        </p>
      </div>

      {feedbackMsg && (
        <div className="p-4 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center space-x-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{feedbackMsg}</span>
        </div>
      )}

      <form onSubmit={handleSaveSettings} className="space-y-8 text-xs text-slate-300">
        {/* Bloco 1: Controle Mestre da IA */}
        <div className="bg-slate-850 p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Bot className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-sm font-bold text-white">IA Geral do Sistema</h3>
                <p className="text-[11px] text-slate-400">
                  Interruptor mestre que ativa ou desativa qualquer resposta automática da IA
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setGlobalAi(!globalAi)}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                globalAi ? 'bg-emerald-500' : 'bg-slate-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  globalAi ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          <div className="text-[11px] text-slate-400 p-3 rounded-lg bg-slate-900 border border-slate-800 leading-relaxed">
            {globalAi ? (
              <span className="text-emerald-400 font-medium">
                ✓ A IA está habilitada para atender novos leads e aplicar o fluxo natural até o envio do PDF e transferência para humano.
              </span>
            ) : (
              <span className="text-amber-400 font-medium">
                ⚠ A IA está pausada globalmente. Nenhuma mensagem automática será gerada até ser reativada.
              </span>
            )}
          </div>
        </div>

        {/* Bloco 2: Chave Google Gemini API */}
        <div className="bg-slate-850 p-6 rounded-2xl border border-slate-800 space-y-4">
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-800">
            <Key className="w-5 h-5 text-purple-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Google Gemini API (Inteligência Artificial)</h3>
              <p className="text-[11px] text-slate-400">
                Chave utilizada para gerar as respostas humanizadas e analisar o caso dos tutores
              </p>
            </div>
          </div>

          <div>
            <label className="block text-slate-200 font-semibold mb-1">
              GEMINI_API_KEY *
            </label>
            <div className="relative">
              <input
                type={showGeminiKey ? 'text' : 'password'}
                required
                placeholder="AQ.Ab8..."
                value={geminiApiKey}
                onChange={(e) => setGeminiApiKey(e.target.value)}
                className="w-full pl-3.5 pr-10 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-xs font-mono"
              />
              <button
                type="button"
                onClick={() => setShowGeminiKey(!showGeminiKey)}
                className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
              >
                {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            <span className="text-[11px] text-slate-400 mt-1 block">
              Ao salvar, esta chave é gravada no banco e atualizada no arquivo <code>.env</code>.
            </span>
          </div>
        </div>

        {/* Bloco 3: PDFs Oficiais por Cidade / Modalidade */}
        <div className="bg-slate-850 p-6 rounded-2xl border border-slate-800 space-y-5">
          <div className="flex items-center space-x-3 pb-3 border-b border-slate-800">
            <FileText className="w-5 h-5 text-teal-400" />
            <div>
              <h3 className="text-sm font-bold text-white">
                Materiais em PDF por Cidade (Regras 18 & 21)
              </h3>
              <p className="text-[11px] text-slate-400">
                A IA seleciona e envia automaticamente o PDF correto de acordo com a cidade identificada
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-slate-200 font-semibold mb-1">
                📍 Cuiabá (Presencial com João Eduardo) - {'{{PDF_CUIABA}}'}
              </label>
              <input
                type="url"
                required
                placeholder="https://..."
                value={pdfCuiaba}
                onChange={(e) => setPdfCuiaba(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-xs"
              />
            </div>

            <div>
              <label className="block text-slate-200 font-semibold mb-1">
                📍 Várzea Grande (Presencial com João Eduardo) - {'{{PDF_VG}}'}
              </label>
              <input
                type="url"
                required
                placeholder="https://..."
                value={pdfVg}
                onChange={(e) => setPdfVg(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-xs"
              />
            </div>

            <div>
              <label className="block text-slate-200 font-semibold mb-1">
                🌐 Outras Cidades (Online com Nicolle) - {'{{PDF_ONLINE}}'}
              </label>
              <input
                type="url"
                required
                placeholder="https://..."
                value={pdfOnline}
                onChange={(e) => setPdfOnline(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-xs"
              />
            </div>
          </div>
        </div>

        {/* Bloco 4: Evolution API (WhatsApp) */}
        <div className="bg-slate-850 p-6 rounded-2xl border border-slate-800 space-y-5">
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div className="flex items-center space-x-3">
              <Wifi className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-sm font-bold text-white">Conexão WhatsApp (Evolution API)</h3>
                <p className="text-[11px] text-slate-400">
                  Dados de conexão da instância SPE na Evolution API
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={testEvolution}
              disabled={testingConnection}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs border border-slate-700 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingConnection ? 'animate-spin' : ''}`} />
              <span>Testar Conexão</span>
            </button>
          </div>

          {/* Status Badge */}
          <div className="flex items-center space-x-3 p-3.5 rounded-xl bg-slate-900 border border-slate-800">
            <div
              className={`w-3 h-3 rounded-full ${
                evolutionStatus?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <div className="flex-1">
              <span className="font-semibold text-white">
                Status Atual: {evolutionStatus?.connected ? 'Conectado e Operacional' : 'Aguardando / Desconectado'}
              </span>
              <span className="text-[11px] text-slate-400 ml-2">
                (Estado: {evolutionStatus?.state || 'desconhecido'})
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-slate-200 font-semibold mb-1">
                Evolution API URL (EVOLUTION_API_URL)
              </label>
              <input
                type="text"
                value={evolutionUrl}
                onChange={(e) => setEvolutionUrl(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 text-xs"
              />
            </div>

            <div>
              <label className="block text-slate-200 font-semibold mb-1">
                Nome da Instância (EVOLUTION_INSTANCE_NAME)
              </label>
              <input
                type="text"
                value={evolutionInstance}
                onChange={(e) => setEvolutionInstance(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 text-xs"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-slate-200 font-semibold mb-1">
                Chave da API (EVOLUTION_API_KEY)
              </label>
              <div className="relative">
                <input
                  type={showEvolutionKey ? 'text' : 'password'}
                  value={evolutionApiKey}
                  onChange={(e) => setEvolutionApiKey(e.target.value)}
                  className="w-full pl-3.5 pr-10 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 text-xs font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowEvolutionKey(!showEvolutionKey)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200"
                >
                  {showEvolutionKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </div>

          {/* Webhook Configuration Guide */}
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800 space-y-2">
            <div className="font-semibold text-white flex items-center justify-between">
              <span>URL do Webhook para configurar na Evolution API:</span>
              <button
                type="button"
                onClick={copyWebhook}
                className="flex items-center space-x-1 text-emerald-400 hover:text-emerald-300 font-medium"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copiado!' : 'Copiar URL'}</span>
              </button>
            </div>
            <div className="p-2.5 rounded bg-slate-950 font-mono text-xs text-slate-300 border border-slate-800 break-all select-all">
              {webhookUrl || 'https://[seu-servidor]/api/webhooks/evolution'}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Ative o evento <strong>MESSAGES_UPSERT</strong> nas configurações de webhook da instância na Evolution API.
            </p>
          </div>
        </div>

        {/* Save Button */}
        <div className="flex items-center justify-end space-x-3 pt-4 border-t border-slate-800">
          <button
            type="submit"
            disabled={saving}
            className="flex items-center space-x-2 px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold transition shadow-sm disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{saving ? 'Gravando Alterações...' : 'Salvar Todas as Configurações'}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
