import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import type { Comunidade, Lote } from '../lib/types';
import type { FaltasComunidade } from '../lib/domingos';

/** Contexto da app Presenças: comunidades autorizadas, a escolhida e os registos do ano atual. */
export interface ContextoPresencas {
  comunidades: Comunidade[];
  /** Comunidade escolhida no topo ('todas' = todas as do utilizador). */
  comunidade: string;
  setComunidade: (id: string) => void;
  /** As comunidades do contexto (a escolhida, ou todas). */
  doContexto: Comunidade[];
  lotes: Lote[];
  aCarregar: boolean;
  erro: string | null;
  recarregar: () => Promise<void>;
  /** Registos em falta do ano atual nas comunidades do contexto (null enquanto carrega). */
  faltas: FaltasComunidade[] | null;
}
export const PzCtx = createContext<ContextoPresencas | null>(null);
export const usePz = () => useContext(PzCtx)!;

/** Cor de cada contagem (texto e fundo nunca dependem só da cor: o nome está sempre escrito). */
export const corDe = (id: string) => ({ adultos: 'adultos', jump: 'jump', criancas: 'criancas', connects: 'connects' } as Record<string, string>)[id] ?? 'outra';

const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
export const diaSemana = (iso: string) => DIAS[new Date(`${iso}T12:00:00Z`).getUTCDay()];
export const nomeMes = (aaaamm: string) => `${MESES[Number(aaaamm.slice(5, 7)) - 1]} ${aaaamm.slice(0, 4)}`;
export const hora = (iso?: string) => {
  const d = iso ? new Date(iso) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleTimeString('pt-PT', { timeZone: 'Europe/Lisbon', hour: '2-digit', minute: '2-digit' }) : '';
};

export function Mensagem({ tipo, children }: { tipo: 'erro' | 'ok' | 'info'; children: ReactNode }) {
  const Ico = tipo === 'erro' ? AlertCircle : tipo === 'ok' ? CheckCircle2 : Info;
  return <div className={`pz-msg ${tipo}`} role={tipo === 'erro' ? 'alert' : 'status'}><Ico size={20} aria-hidden style={{ flex: 'none', marginTop: 1 }} /><div>{children}</div></div>;
}

/** Painel inferior (bottom sheet): fecha com Esc, no fundo ou no X; o foco entra no painel e volta ao sair. */
export function Painel({ titulo, aoFechar, children }: { titulo: string; aoFechar: () => void; children: ReactNode }) {
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const antes = document.activeElement as HTMLElement | null;
    caixa.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    document.addEventListener('keydown', esc);
    return () => { document.removeEventListener('keydown', esc); antes?.focus?.(); };
  }, [aoFechar]);
  return (
    <div className="pz-fundo" onClick={aoFechar}>
      <div className="pz-sheet" role="dialog" aria-modal="true" aria-label={titulo} tabIndex={-1} ref={caixa} onClick={(e) => e.stopPropagation()}>
        <div className="pz-sheet-pega" aria-hidden />
        <div className="pz-sheet-topo"><h2>{titulo}</h2><button className="pz-link" onClick={aoFechar} aria-label="Fechar"><X size={22} aria-hidden /></button></div>
        {children}
      </div>
    </div>
  );
}

/** Estado de carregamento ou erro, em linguagem simples. */
export function EstadoPz({ aCarregar, erro }: { aCarregar: boolean; erro: string | null }) {
  if (erro) return <Mensagem tipo="erro">Não foi possível carregar os dados. Verifique a ligação à internet e tente de novo. <span className="pz-peq">({erro})</span></Mensagem>;
  if (aCarregar) return <p className="pz-muted" role="status">A carregar…</p>;
  return null;
}
