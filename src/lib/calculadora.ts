/**
 * Ferramentas › Calculadora de distribuição (FER-01): reparte um montante pelas comunidades segundo os pesos
 * (percentagens inteiras) e compara com uma distribuição manual.
 */
import { fecharEm100 } from './resumos';
import type { CustoFixo, Nivel } from './types';

const cent = (v: number) => Math.round(v * 100);

/** Reparte o montante pelos pesos (%), em cêntimos; os cêntimos que sobram vão para os maiores restos. */
export function distribuir(total: number, pesos: Record<string, number>): Record<string, number> {
  const ents = Object.entries(pesos).map(([c, p]) => [c, Math.max(0, p || 0)] as const);
  const somaP = ents.reduce((t, [, p]) => t + p, 0);
  const totalC = cent(total);
  if (!totalC || !somaP) return Object.fromEntries(ents.map(([c]) => [c, 0]));
  const brutos = ents.map(([c, p]) => ({ c, v: (totalC * p) / somaP }));
  const out = Object.fromEntries(brutos.map(({ c, v }) => [c, Math.floor(v + 1e-9)]));
  let falta = totalC - Object.values(out).reduce((t, v) => t + v, 0);
  for (const { c } of [...brutos].sort((a, b) => (b.v % 1) - (a.v % 1) || b.v - a.v)) { if (falta <= 0) break; out[c] += 1; falta -= 1; }
  return Object.fromEntries(Object.entries(out).map(([c, v]) => [c, v / 100]));
}

/** Montante de uma percentagem do total, em euros com 2 casas. */
export const montanteDePct = (total: number, pct: number) => cent((total * pct) / 100) / 100;
/** Percentagem inteira que um montante representa no total (0 sem total). */
export const pctDeMontante = (total: number, montante: number) => (total ? Math.round((montante / total) * 100) : 0);

/** Totais da distribuição manual: soma dos montantes, soma das % e o que falta distribuir. */
export function resumoManual(total: number, montantes: Record<string, number>, pcts: Record<string, number>) {
  const montante = cent(Object.values(montantes).reduce((t, v) => t + (v || 0), 0)) / 100;
  const pct = Object.values(pcts).reduce((t, v) => t + (v || 0), 0);
  return { montante, pct, porDistribuir: (cent(total) - cent(montante)) / 100 };
}

/** Média dos pesos de vários meses (uma comunidade sem peso num mês conta 0), em inteiros que somam 100. */
export function pesosMediaAnual(meses: Record<string, number>[]): Record<string, number> {
  if (!meses.length) return {};
  const ids = [...new Set(meses.flatMap((m) => Object.keys(m)))];
  return fecharEm100(Object.fromEntries(ids.map((c) => [c, meses.reduce((t, m) => t + (m[c] ?? 0), 0) / meses.length])));
}

export type Lancamento = { tipo: 'mes'; mes: number } | { tipo: 'ano' };
export interface DadosCustoFixo {
  rubrica: string; categoria: string; centroCusto: string;
  projeto?: string; fornecedor?: string; contaAnalitica?: string;
  nivel: Nivel; ano: number; notas?: string; lancamento: Lancamento;
}
const slugRubrica = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const mm = (ano: number, m: number) => `${ano}-${String(m).padStart(2, '0')}`;

/**
 * Linhas de custos fixos (uma por comunidade com montante) a partir da distribuição: de uma vez num mês, ou dividido
 * pelos 12 meses do ano (quando o montante não divide certo, os cêntimos que sobram ficam numa linha de dezembro).
 * Custos locais, com incidência de 100 %. Os campos opcionais vazios não vão para a linha.
 */
export function linhasCustosFixos(montantes: Record<string, number>, d: DadosCustoFixo): CustoFixo[] {
  const extra = Object.fromEntries(Object.entries({ categoria: d.categoria, centroCusto: d.centroCusto, projeto: d.projeto, fornecedor: d.fornecedor, contaAnalitica: d.contaAnalitica }).filter(([, v]) => v));
  const linha = (comunidadeId: string, valorMensal: number, inicio: string, fim: string): CustoFixo => ({
    id: `${comunidadeId}-${slugRubrica(d.rubrica)}-${inicio}`, comunidadeId, rubrica: d.rubrica.trim(), valorMensal, incidencia: 100, ambito: 'local',
    ...extra, ano: d.ano, inicio, fim, nivel: d.nivel, ...(d.notas ? { notas: d.notas } : {}),
  });
  const out: CustoFixo[] = [];
  for (const [c, v] of Object.entries(montantes)) {
    const total = cent(v);
    if (total <= 0) continue;
    if (d.lancamento.tipo === 'mes') { const p = mm(d.ano, d.lancamento.mes); out.push(linha(c, total / 100, p, p)); continue; }
    const q = Math.floor(total / 12);
    if (q * 12 === total) { out.push(linha(c, q / 100, mm(d.ano, 1), mm(d.ano, 12))); continue; }
    out.push(linha(c, q / 100, mm(d.ano, 1), mm(d.ano, 11)));
    out.push(linha(c, (total - q * 11) / 100, mm(d.ano, 12), mm(d.ano, 12)));
  }
  return out;
}
