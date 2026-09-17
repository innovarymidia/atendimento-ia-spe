import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import Sidebar from '@/components/Sidebar';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Seu Pet Equilibrado | Atendimento IA',
  description: 'Sistema de Atendimento Automatizado com Controle Determinístico e WhatsApp - Seu Pet Equilibrado',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="h-full">
      <body className={`${inter.className} h-full bg-slate-950 text-slate-100 flex overflow-hidden`}>
        <Sidebar />
        <main className="flex-1 flex flex-col h-full min-w-0 bg-slate-900 overflow-y-auto">
          {children}
        </main>
      </body>
    </html>
  );
}
