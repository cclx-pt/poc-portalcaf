/**
 * Ferramentas › Calculadora de distribuição (FER-01): reparte um montante pelas comunidades segundo os pesos
 * (percentagens inteiras) e compara com uma distribuição manual.
 */
import { fecharEm100 } from './resumos';

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
