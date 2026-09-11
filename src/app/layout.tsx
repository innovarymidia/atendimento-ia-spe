import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Atendimento IA - Adestramento de Cães",
  description: "Sistema Real de Atendimento Automatizado WhatsApp com Evolution API + Gemini",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="flex h-screen bg-slate-50 text-slate-900 antialiased overflow-hidden">
        {/* Sidebar fixa */}
        <aside className="w-64 border-r border-slate-200 bg-white flex flex-col justify-between shrink-0 shadow-xs">
          <div>
            <div className="p-5 border-b border-slate-100 flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold text-lg">
                SPE
              </div>
              <div>
                <h1 className="font-bold text-sm text-slate-800 leading-tight">Adestramento Cães</h1>
                <span className="text-xs text-slate-400">Atendimento WhatsApp</span>
              </div>
            </div>

            <nav className="p-3 space-y-1">
              <Link
                href="/dashboard"
                className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
              >
                📊 Dashboard
              </Link>
              <Link
                href="/conversas"
                className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
              >
                💬 Conversas / Inbox
              </Link>
              <Link
                href="/leads"
                className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
              >
                👥 Leads & Contatos
              </Link>
              <Link
                href="/configuracoes"
                className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
              >
                ⚙️ Configurações
              </Link>
              <Link
                href="/ai-config"
                className="flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-lg text-slate-700 hover:bg-slate-100 transition-colors"
              >
                🤖 Configuração da IA
              </Link>
            </nav>
          </div>

          <div className="p-4 border-t border-slate-100 bg-slate-50/50">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
              <span className="text-xs font-medium text-slate-600">Evolution API: Conectada</span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">Buffer: 4000ms | Gemini Ativo</div>
          </div>
        </aside>

        {/* Conteúdo Principal */}
        <main className="flex-1 flex flex-col overflow-hidden">
          {children}
        </main>
      </body>
    </html>
  );
}
