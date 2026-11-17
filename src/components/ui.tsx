import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dataPT, eur, eurK, lerDataPT, mascaraDataPT, num } from '../lib/format';
import { CATEGORICAS, CORES } from '../lib/cores';

// ---------- filtros globais (ano e comunidade) ----------
interface Filtros { ano: number; setAno: (a: number) => void; comunidade: string; setComunidade: (c: string) => void }
const FiltrosCtx = createContext<Filtros | null>(null);
export function FiltrosProvider({ children }: { children: ReactNode }) {
  const [ano, setAno] = useState(new Date().getFullYear());
  const [comunidade, setComunidade] = useState('todas');
  return <FiltrosCtx.Provider value={{ ano, setAno, comunidade, setComunidade }}>{children}</FiltrosCtx.Provider>;
}
export const useFiltros = () => useContext(FiltrosCtx)!;

// ---------- carregamento ----------
export function useCarregar<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [dados, setDados] = useState<T | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aCarregar, setACarregar] = useState(true);
  const recarregar = useCallback(async () => {
    setACarregar(true); setErro(null);
    try { setDados(await fn()); } catch (e) { setErro(mensagemErro(e)); } finally { setACarregar(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => { void recarregar(); }, [recarregar]);
  return { dados, erro, aCarregar, recarregar, setDados };
}

export function mensagemErro(e: unknown) {
  const s = e instanceof Error ? e.message : String(e);
  if (/permission|insufficient/i.test(s)) return 'Sem permissão para estes dados. Confirme o seu perfil com o Master.';
  return s;
}

export function Estado({ aCarregar, erro, vazio }: { aCarregar: boolean; erro: string | null; vazio?: boolean }) {
  // Espaço reservado com a forma dos indicadores e da tabela, para a página não saltar ao chegar os dados.
  if (aCarregar) return (
    <div className="esqueleto" aria-busy="true" aria-live="polite">
      <span className="muted">A carregar…</span>
      <div className="blocos">{[0, 1, 2, 3].map((i) => <div key={i} className="bloco" />)}</div>
      {[0, 1, 2, 3, 4, 5].map((i) => <div key={i} className="linha-e" />)}
    </div>
  );
  if (erro) return <div className="aviso">{erro}</div>;
  if (vazio) return <p className="muted">Sem dados para este período.</p>;
  return null;
}

// ---------- KPI ----------
export function Kpi({ titulo, valor, sub, negativo }: { titulo: string; valor: string; sub?: ReactNode; negativo?: boolean }) {
  return (
    <div className="kpi">
      <h3>{titulo}</h3>
      <div className={'valor' + (negativo ? ' neg' : '')}>{valor}</div>
      {sub && <div className="sub">{sub}</div>}
    </div>
  );
}

// ---------- gráfico de barras ----------
export const TONS = CATEGORICAS;
export interface Serie { key: string; nome: string; stack?: string; cor?: keyof typeof CORES | string }
export function GraficoBarras({ dados, series, altura = 280, empilhado, unidade = 'eur' }: {
  dados: Record<string, string | number>[];
  series: Serie[];
  altura?: number;
  empilhado?: boolean;
  /** 'pessoas': eixos e dicas sem símbolo de moeda. */
  unidade?: 'eur' | 'pessoas';
}) {
  const fmtEixo = (v: number) => (unidade === 'eur' ? eurK(v) : num(v));
  const fmtDica = (v: number) => (unidade === 'eur' ? eur(v) : num(v, Number.isInteger(v) ? 0 : 1));
  const cor = (s: Serie, i: number) => (s.cor && s.cor in CORES ? CORES[s.cor as keyof typeof CORES] : s.cor ?? CATEGORICAS[i % CATEGORICAS.length]);
  // Cantos arredondados só no topo de cada barra (na última série de cada pilha).
  const ultimaDaPilha = (s: Serie, i: number) => !empilhado || series.slice(i + 1).every((x) => (x.stack ?? 'a') !== (s.stack ?? 'a'));
  return (
    <div role="img" aria-label={'Gráfico: ' + series.map((s) => s.nome).join(', ')} style={{ width: '100%', height: altura }}>
      <ResponsiveContainer>
        <BarChart data={dados} margin={{ top: 10, right: 10, left: 10, bottom: 0 }} barCategoryGap="30%" barGap={4}>
          <CartesianGrid stroke={CORES.grelha} vertical={false} />
          <XAxis dataKey="rotulo" tick={{ fontSize: 11, fill: CORES.texto }} axisLine={{ stroke: CORES.eixo }} tickLine={false} />
          <YAxis tickFormatter={(v) => fmtEixo(Number(v))} tick={{ fontSize: 11, fill: CORES.texto }} axisLine={false} tickLine={false} width={80} />
          <Tooltip cursor={{ fill: '#f2f2f2' }} formatter={(v) => fmtDica(Number(v))} contentStyle={{ border: '1px solid #333', borderRadius: 0, fontSize: 12 }} />
          {series.length > 1 && <Legend wrapperStyle={{ fontSize: 12 }} iconType="square" formatter={(v) => <span style={{ color: CORES.texto }}>{v}</span>} />}
          {series.map((s, i) => (
            <Bar key={s.key} dataKey={s.key} name={s.nome} fill={cor(s, i)} stackId={empilhado ? s.stack ?? 'a' : undefined}
              maxBarSize={36} radius={ultimaDaPilha(s, i) ? [4, 4, 0, 0] : 0} stroke="#fff" strokeWidth={empilhado ? 1 : 0} isAnimationActive={false} />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function Modal({ titulo, onFechar, children }: { titulo: string; onFechar: () => void; children: ReactNode }) {
  return (
    <div className="modal-fundo" onClick={onFechar}>
      <div className="modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-label={titulo}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{titulo}</h2>
          <button className="sec" onClick={onFechar} aria-label="Fechar">Fechar</button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Rodape() {
  return (
    <div className="pe">
      <b>CONSELHO ADMINISTRATIVO E FINANCEIRO • CCLX</b>
      <span>Portal CAF · PoC · Valores em euros (€), com duas casas decimais</span>
    </div>
  );
}

// ---------- frescura dos dados ----------
/**
 * Linha comum às páginas de análise: até quando vão os valores, quando foram calculados os resumos
 * e quando foi a última sincronização com o Jotform.
 */
export function Frescura({ calculadoEm, ate, ano }: { calculadoEm?: string; ate: number; ano: number }) {
  const sync = useCarregar(async () => (await import('../lib/db')).lerEstadoSync(), []);
  const dt = (s?: string) => (s ? new Date(s).toLocaleString('pt-PT', { dateStyle: 'short', timeStyle: 'short' }) : '—');
  const MES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  return (
    <p className="frescura">
      Valores {ate ? `até ${MES[ate - 1]} de ${ano}` : `de ${ano}`} · resumos calculados em {dt(calculadoEm)} · última sincronização com o Jotform: {dt(sync.dados?.fim)} · fonte: Jotform e tabela de custos fixos
    </p>
  );
}

// ---------- campo de data em dd/mm/aaaa (norma portuguesa, igual em qualquer browser) ----------
/** Data escrita como dd/mm/aaaa; devolve AAAA-MM-DD (ou '' enquanto incompleta/inválida). */
export function CampoData({ rotulo, valor, onChange, max, obrigatorio }: { rotulo: string; valor: string; onChange: (iso: string) => void; max?: string; obrigatorio?: boolean }) {
  const [texto, setTexto] = useState(dataPT(valor));
  const calendario = useRef<HTMLInputElement>(null);
  useEffect(() => { if ((lerDataPT(texto) ?? '') !== valor) setTexto(dataPT(valor)); }, [valor]); // eslint-disable-line react-hooks/exhaustive-deps
  const iso = lerDataPT(texto);
  const erro = texto.length === 10 && !iso ? 'Data inválida' : iso && max && iso > max ? `Não pode ser depois de ${dataPT(max)}` : null;
  const abrirCalendario = () => {
    const el = calendario.current;
    if (!el) return;
    try { el.showPicker(); } catch { el.focus(); el.click(); }
  };
  return (
    <div className="campo campo-data">
      <label>{rotulo}{obrigatorio ? ' *' : ''}</label>
      <div className="campo-data-linha">
        <input type="text" inputMode="numeric" placeholder="dd/mm/aaaa" maxLength={10} autoComplete="off" value={texto} aria-invalid={!!erro} aria-label={rotulo}
          onChange={(e) => { const t = mascaraDataPT(e.target.value); setTexto(t); const d = lerDataPT(t); onChange(d && (!max || d <= max) ? d : ''); }} />
        <button type="button" className="botao-calendario" aria-label="Abrir calendário" title="Escolher no calendário" onClick={abrirCalendario}>
          <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="5" width="18" height="16" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>
        </button>
        {/* Calendário do sistema (telemóvel ou computador); o campo continua a mostrar dd/mm/aaaa. */}
        <input ref={calendario} type="date" className="calendario-oculto" tabIndex={-1} aria-hidden="true" value={iso ?? ''} max={max}
          onChange={(e) => { const d = e.target.value; if (!d) return; setTexto(dataPT(d)); onChange(!max || d <= max ? d : ''); }} />
      </div>
      {erro && <span className="small erro-campo">{erro}</span>}
    </div>
  );
}
