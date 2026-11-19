/** Domingos (dia das celebrações) e domingos sem registo de assistência. Datas AAAA-MM-DD, sempre em UTC. */
import { norm } from './format';
import type { Comunidade, ExcecaoAssistencia, Lote, Registo } from './types';
import type { EventoConfig } from './eventos';

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

/** Evento cuja contagem é obrigatória: marcado assim na configuração; sem marcação, só o evento da celebração de domingo. */
export function eventoObrigatorio(e: Pick<EventoConfig, 'nome' | 'ativo' | 'dias' | 'obrigatorio'>, eventoCelebracao?: string | null): boolean {
  if (!e.ativo || !e.dias.length) return false;
  return e.obrigatorio ?? (!!eventoCelebracao && norm(e.nome) === norm(eventoCelebracao));
}

export interface RegistoEmFalta { data: string; evento: string }
export interface FaltasComunidade { comunidadeId: string; esperados: number; comRegisto: number; emFalta: RegistoEmFalta[] }

/**
 * Registos em falta: para cada evento obrigatório, cada dia da semana em que ocorre (desde `desde` ou 1 de janeiro,
 * desde a data em que passou a obrigatório, até ontem), por comunidade ativa, sem registo desse evento nesse dia.
 * As exceções do dia (da CCLX ou da comunidade) não contam.
 */
export function registosEmFalta(p: {
  ano: number; hoje: string; comunidades: Comunidade[]; assistencia: Lote[]; excecoes: ExcecaoAssistencia[];
  eventos: EventoConfig[]; eventoCelebracao?: string | null; desde?: string;
}): FaltasComunidade[] {
  const obrig = p.eventos.filter((e) => eventoObrigatorio(e, p.eventoCelebracao));
  // Sem celebração configurada nem eventos obrigatórios: regra antiga (qualquer registo ao domingo).
  if (!obrig.length && !p.eventoCelebracao && !p.eventos.some((e) => e.obrigatorio === false)) {
    return domingosEmFalta({ ...p, evento: null }).map((f) => ({ ...f, emFalta: f.emFalta.map((data) => ({ data, evento: 'Domingo' })) }));
  }
  const excecao = new Set(p.excecoes.map((e) => `${e.data}|${e.ambito}`));
  const comRegisto = new Set(p.assistencia.flatMap((l) => l.registos.map((r) => `${l.comunidadeId}|${r.data}|${norm(r.evento ?? '')}`)));
  // Dias esperados de cada evento obrigatório.
  const dias: RegistoEmFalta[] = [];
  const d = utc(p.desde && p.desde > `${p.ano}-01-01` ? p.desde : `${p.ano}-01-01`);
  for (; d.getUTCFullYear() === p.ano && iso(d) < p.hoje; d.setUTCDate(d.getUTCDate() + 1)) {
    for (const e of obrig) if (e.dias.includes(d.getUTCDay()) && (!e.obrigatorioDesde || iso(d) >= e.obrigatorioDesde)) dias.push({ data: iso(d), evento: e.nome });
  }
  return p.comunidades
    .filter((c) => !c.especial)
    .map((c) => {
      const esperados = dias.filter((x) => dentroDaVigencia(c, x.data) && !excecao.has(`${x.data}|cclx`) && !excecao.has(`${x.data}|${c.id}`));
      const emFalta = esperados.filter((x) => !comRegisto.has(`${c.id}|${x.data}|${norm(x.evento)}`));
      return { comunidadeId: c.id, esperados: esperados.length, comRegisto: esperados.length - emFalta.length, emFalta };
    })
    .filter((x) => x.esperados > 0);
}
