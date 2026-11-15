/** Domingos (dia das celebrações) e domingos sem registo de assistência. Datas AAAA-MM-DD, sempre em UTC. */
import { norm } from './format';
import type { Comunidade, ExcecaoAssistencia, Lote, Registo } from './types';

const utc = (d: string) => new Date(`${d}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);

export function eDomingo(data: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(data) && utc(data).getUTCDay() === 0;
}

/**
 * Registo que conta para a média de assistência (bolsa geral, gerais, valores por pessoa):
 * com o tipo de celebração configurado, só registos desse tipo (em qualquer dia);
 * sem configuração, os registos feitos a um domingo.
 */
export function contaParaMedia(r: Pick<Registo, 'data' | 'evento'>, eventoCelebracao?: string | null): boolean {
  if (eventoCelebracao) return norm(r.evento ?? '') === norm(eventoCelebracao);
  return eDomingo(r.data);
}

/** Domingos do ano com data estritamente anterior a `antesDe`. */
export function domingosDoAno(ano: number, antesDe: string): string[] {
  const d = utc(`${ano}-01-01`);
  d.setUTCDate(d.getUTCDate() + ((7 - d.getUTCDay()) % 7));
  const out: string[] = [];
  while (d.getUTCFullYear() === ano && iso(d) < antesDe) {
    out.push(iso(d));
    d.setUTCDate(d.getUTCDate() + 7);
  }
  return out;
}

export interface DomingosComunidade { comunidadeId: string; esperados: number; comRegisto: number; emFalta: string[] }

/**
 * Por comunidade ativa (não especial): domingos esperados (sem exceção da CCLX nem da comunidade),
 * quantos têm registo de assistência nesse dia, e quais faltam. O domingo de hoje ainda não conta.
 */
export function domingosEmFalta(p: { ano: number; hoje: string; comunidades: Comunidade[]; assistencia: Lote[]; excecoes: ExcecaoAssistencia[]; evento?: string | null }): DomingosComunidade[] {
  const domingos = domingosDoAno(p.ano, p.hoje);
  const excecao = new Set(p.excecoes.map((e) => `${e.data}|${e.ambito}`));
  // Com tipo de celebração configurado, só conta um registo desse tipo nesse domingo.
  const comRegisto = new Set(p.assistencia.flatMap((l) => l.registos
    .filter((r) => !p.evento || norm(r.evento ?? '') === norm(p.evento))
    .map((r) => `${l.comunidadeId}|${r.data}`)));
  return p.comunidades
    .filter((c) => !c.especial)
    .map((c) => {
      const esperados = domingos.filter((d) => dentroDaVigencia(c, d)
        && !excecao.has(`${d}|cclx`) && !excecao.has(`${d}|${c.id}`));
      const emFalta = esperados.filter((d) => !comRegisto.has(`${c.id}|${d}`));
      return { comunidadeId: c.id, esperados: esperados.length, comRegisto: esperados.length - emFalta.length, emFalta };
    })
    .filter((x) => x.esperados > 0);
}

/** Vigência ao dia (início/fim podem ser a meio do mês). */
function dentroDaVigencia(c: Comunidade, d: string) {
  return (!c.inicio || c.inicio.slice(0, 10) <= d) && (!c.fim || c.fim.slice(0, 10) >= d);
}
