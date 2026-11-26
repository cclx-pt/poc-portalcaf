/** Histórico da app Presenças: registos agrupados por mês e dia, e números do ecrã de início. */
import { eRegistoDoPortal, resumoRegistoPresenca } from './presencas';
import type { FaltasComunidade } from './domingos';
import type { Lote } from './types';

export interface RegistoHistorico { lote: Lote; registo: Lote['registos'][number]; total: number }
export interface DiaHistorico { data: string; total: number; registos: RegistoHistorico[] }
export interface MesHistorico { mes: string; dias: DiaHistorico[] }

/** Meses e dias com registos, mais recentes primeiro. `extras`: contagens configuradas além das base (entram no total). */
export function agruparHistorico(lotes: Lote[], extras: { id: string; nome: string }[] = []): MesHistorico[] {
  const dias = new Map<string, RegistoHistorico[]>();
  for (const l of lotes) for (const r of l.registos) {
    dias.set(r.data, [...(dias.get(r.data) ?? []), { lote: l, registo: r, total: resumoRegistoPresenca(r, extras).total }]);
  }
  const meses = new Map<string, DiaHistorico[]>();
  for (const data of [...dias.keys()].sort().reverse()) {
    const registos = dias.get(data)!.sort((a, b) => (a.registo.evento ?? '').localeCompare(b.registo.evento ?? '', 'pt'));
    const d: DiaHistorico = { data, total: registos.reduce((s, x) => s + x.total, 0), registos };
    meses.set(data.slice(0, 7), [...(meses.get(data.slice(0, 7)) ?? []), d]);
  }
  return [...meses].map(([mes, ds]) => ({ mes, dias: ds }));
}

export type OrigemPresenca = 'portal' | 'jotform';
/** Só os registos de uma origem (portal ou Jotform); sem origem, todos. */
export function filtrarOrigem(lotes: Lote[], origem?: OrigemPresenca): Lote[] {
  if (!origem) return lotes;
  return lotes.map((l) => ({ ...l, registos: l.registos.filter((r) => eRegistoDoPortal(r) === (origem === 'portal')) })).filter((l) => l.registos.length);
}

/** Números do início: registos obrigatórios em falta e efetuados (de esperados). */
export function resumoInicio(falta: FaltasComunidade[]) {
  return { emFalta: falta.reduce((s, f) => s + f.emFalta.length, 0), efetuados: falta.reduce((s, f) => s + f.comRegisto, 0), esperados: falta.reduce((s, f) => s + f.esperados, 0) };
}
