'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  MessageSquare,
  ShieldBan,
  Settings,
  Bot,
  Wifi,
  WifiOff,
  Power
} from 'lucide-react';

export default function Sidebar() {
  const pathname = usePathname();
  const [globalAi, setGlobalAi] = useState<boolean>(true);
  const [evolutionConnected, setEvolutionConnected] = useState<boolean>(false);
  const [loadingToggle, setLoadingToggle] = useState<boolean>(false);

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 15000);
    return () => clearInterval(interval);
  }, []);

  async function fetchStatus() {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data?.settings) {
        setGlobalAi(data.settings.globalAiEnabled === 'true');
      }
      if (data?.evolutionStatus) {
        setEvolutionConnected(data.evolutionStatus.connected);
      }
    } catch (e) {
      console.error(e);
    }
  }

  async function toggleGlobalAi() {
    try {
      setLoadingToggle(true);
      const nextVal = !globalAi;
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ globalAiEnabled: String(nextVal) })
      });
      if (res.ok) {
        setGlobalAi(nextVal);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingToggle(false);
    }
  }

  const navItems = [
    {
      label: 'Dashboard',
      href: '/',
      icon: LayoutDashboard,
      active: pathname === '/'
    },
    {
      label: 'Atendimentos ao Vivo',
      href: '/conversas',
      icon: MessageSquare,
      active: pathname.startsWith('/conversas')
    },
    {
      label: 'Contatos Excluídos da IA',
      href: '/contatos-excluidos',
      icon: ShieldBan,
      active: pathname.startsWith('/contatos-excluidos'),
      badge: 'Prioridade'
    },
    {
      label: 'Configurações',
      href: '/configuracoes',
      icon: Settings,
      active: pathname.startsWith('/configuracoes')
    }
  ];

  return (
    <aside className="w-64 bg-slate-900 text-slate-200 flex flex-col border-r border-slate-800 shrink-0 select-none">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-800">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-emerald-900/30">
            🐾
          </div>
          <div>
            <h1 className="font-bold text-base text-white tracking-tight leading-none">
              Seu Pet Equilibrado
            </h1>
            <span className="text-xs text-emerald-400 font-medium">
              Atendimento IA & Equipe
            </span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-3 space-y-1.5 overflow-y-auto">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all ${
                item.active
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/70'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Icon className={`w-4 h-4 ${item.active ? 'text-white' : 'text-slate-400'}`} />
                <span>{item.label}</span>
              </div>
              {item.badge && (
                <span className="text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded bg-red-500/20 text-red-300 border border-red-500/30">
                  {item.badge}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Connection & Global AI Status */}
      <div className="p-4 border-t border-slate-800 space-y-3 bg-slate-950/40">
        {/* WhatsApp Connection */}
        <div className="flex items-center justify-between text-xs px-2 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50">
          <div className="flex items-center space-x-2">
            {evolutionConnected ? (
              <Wifi className="w-3.5 h-3.5 text-emerald-400 animate-pulse" />
            ) : (
              <WifiOff className="w-3.5 h-3.5 text-amber-400" />
            )}
            <span className="text-slate-300 font-medium">WhatsApp SPE</span>
          </div>
          <span
            className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${
              evolutionConnected
                ? 'bg-emerald-500/20 text-emerald-300'
                : 'bg-amber-500/20 text-amber-300'
            }`}
          >
            {evolutionConnected ? 'Conectado' : 'Aguardando'}
          </span>
        </div>

        {/* Global AI Master Switch */}
        <div className="rounded-xl p-3 bg-slate-800/80 border border-slate-700/70 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bot className={`w-4 h-4 ${globalAi ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span className="text-xs font-semibold text-slate-200">IA Geral</span>
            </div>
            <button
              type="button"
              onClick={toggleGlobalAi}
              disabled={loadingToggle}
              title={globalAi ? 'Desativar IA Geral' : 'Ativar IA Geral'}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                globalAi ? 'bg-emerald-500' : 'bg-slate-600'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  globalAi ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
          <p className="text-[11px] text-slate-400 leading-tight">
            {globalAi
              ? 'Ativa: Responde novos leads conforme as 31 regras.'
              : 'Silenciada: Nenhuma resposta automática é gerada.'}
          </p>
        </div>

        <div className="text-[11px] text-slate-500 text-center pt-1">
          João Eduardo e Nicolle • SPE
        </div>
      </div>
    </aside>
  );
}
