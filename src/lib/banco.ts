import { norm, parseData, parseNumero, periodo, r2 } from './format';
import type { Linha } from './fontes';
import type { BancoLote, Lote, MovBanco } from './types';

export interface MapaBanco { data?: string; descricao?: string; valor?: string; debito?: string; credito?: string; saldo?: string; estorno?: string }

export type Banco = 'cgd' | 'santander';
export const NOME_BANCO: Record<Banco, string> = { cgd: 'Caixa Geral de Depósitos', santander: 'Santander' };

/** Reconhece o banco pelos cabeçalhos do extrato exportado do homebanking. */
export function detetarBanco(colunas: string[]): Banco | null {
  const n = colunas.map((c) => norm(c));
  if (n.includes('data mov.') || (n.some((c) => c.startsWith('saldo contabilistico apos')) && n.includes('movimento'))) return 'cgd';
  if (n.includes('data operacao') && n.some((c) => c.startsWith('montante'))) return 'santander';
  return null;
}

/** Colunas de cada formato (CGD: "Movimento" com sinal e "Estorno"; Santander: "Montante( EUR )" com sinal). */
export function mapaDoBanco(banco: Banco, colunas: string[]): MapaBanco {
  const acha = (f: (c: string) => boolean) => colunas.find((c) => f(norm(c)));
  if (banco === 'cgd') return {
    data: acha((c) => c.startsWith('data mov')), descricao: acha((c) => c === 'descricao'), valor: acha((c) => c === 'movimento'),
    saldo: acha((c) => c.startsWith('saldo contabilistico')), estorno: acha((c) => c === 'estorno'),
  };
  return {
    data: acha((c) => c.startsWith('data operacao')), descricao: acha((c) => c === 'descricao'), valor: acha((c) => c.startsWith('montante')),
    saldo: acha((c) => c.startsWith('saldo contabilistico')),
  };
}

/** Banco de uma conta (pelo nome do banco ou pelo id). */
export const bancoDaConta = (c: { id: string; banco?: string }): Banco | null =>
  /santander/.test(norm(`${c.banco} ${c.id}`)) ? 'santander' : /caixa|cgd/.test(norm(`${c.banco} ${c.id}`)) ? 'cgd' : null;

export function sugerirMapaBanco(colunas: string[]): MapaBanco {
  const acha = (...ps: string[]) => colunas.find((c) => ps.some((p) => norm(c) === p)) ?? colunas.find((c) => ps.some((p) => norm(c).includes(p)));
  return {
    data: acha('data mov', 'data movimento', 'data lancamento', 'data operacao', 'data'),
    descricao: acha('descricao', 'descritivo', 'movimento', 'designacao'),
    valor: acha('montante', 'valor', 'importancia'),
    debito: acha('debito'),
    credito: acha('credito'),
    saldo: acha('saldo contabilistico', 'saldo'),
  };
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0).toString(36);
}

export function mapearExtrato(linhas: Linha[], m: MapaBanco) {
  const out: MovBanco[] = [];
  const rejeitadas: number[] = [];
  const contagem = new Map<string, number>();
  linhas.forEach((l, i) => {
    const data = parseData(m.data ? l[m.data] : null);
    let valor = NaN;
    if (m.debito || m.credito) {
      const deb = parseNumero(m.debito ? l[m.debito] : 0);
      const cred = parseNumero(m.credito ? l[m.credito] : 0);
      valor = (Number.isFinite(cred) ? Math.abs(cred) : 0) - (Number.isFinite(deb) ? Math.abs(deb) : 0);
      if (!Number.isFinite(deb) && !Number.isFinite(cred)) valor = NaN;
    }
    if ((!Number.isFinite(valor) || valor === 0) && m.valor) valor = parseNumero(l[m.valor]);
    if (!data || !Number.isFinite(valor) || valor === 0) { rejeitadas.push(i + 2); return; }
    const descricao = String((m.descricao ? l[m.descricao] : '') ?? '').replace(/\s+/g, ' ').trim();
    const base = `${data}|${descricao}|${valor}`;
    const k = (contagem.get(base) ?? 0) + 1; contagem.set(base, k);
    const saldo = m.saldo ? parseNumero(l[m.saldo]) : NaN;
    const mov: MovBanco = { id: hash(base + '|' + k), data, descricao, valor: r2(valor), saldo: Number.isFinite(saldo) ? saldo : null, contabilizar: false, conciliadoCom: null, sugestao: null };
    if (m.estorno && String(l[m.estorno] ?? '').trim()) mov.estorno = true;
    out.push(mov);
  });
  // Os homebankings exportam do mais recente para o mais antigo: a ordem cronológica é a inversa.
  const decrescente = out.length < 2 || out[0].data >= out[out.length - 1].data;
  out.forEach((mv, i) => { mv.ordem = decrescente ? out.length - 1 - i : i; });
  return { movimentos: out, rejeitadas };
}

const dias = (a: string, b: string) => Math.abs(new Date(a).getTime() - new Date(b).getTime()) / 86400000;

/** Sugere a reconciliação com os registos Jotform (depósitos e reembolsos) e as ofertas para a bolsa geral. */
export function sugerir(movs: MovBanco[], depositos: Lote[], despesas: Lote[]) {
  const deps = depositos.flatMap((l) => l.registos.map((r) => ({ ...r, comunidadeId: l.comunidadeId, usado: false })));
  const desp = despesas.flatMap((l) => l.registos.map((r) => ({ ...r, comunidadeId: l.comunidadeId, usado: false })));
  for (const m of movs) {
    if (m.conciliadoCom) continue;
    const alvo = m.valor > 0 ? deps : desp;
    const v = Math.abs(m.valor);
    const par = alvo.find((r) => !r.usado && Math.abs(r.valor - v) < 0.005 && dias(r.data, m.data) <= 10);
    if (par) {
      par.usado = true;
      m.sugestao = `${m.valor > 0 ? 'Depósito' : 'Reembolso'} Jotform ${par.id} (${par.comunidadeId})`;
      m.conciliadoCom = `${m.valor > 0 ? 'depositos' : 'despesas'}:${par.id}`;
      m.comunidadeId = m.comunidadeId ?? par.comunidadeId;
      m.contabilizar = false; // já contado pelo Jotform
    } else if (m.valor > 0 && /transf|trf|mb ?way|sepa|oferta|dizimo|donativo/.test(norm(m.descricao))) {
      m.sugestao = 'Possível oferta ou dízimo por transferência: bolsa geral';
    }
  }
  return movs;
}

/** Junta os movimentos importados com os já classificados (mantém a classificação existente). */
export function fundir(novos: MovBanco[], existentes: MovBanco[]) {
  const ex = new Map(existentes.map((m) => [m.id, m]));
  return novos.map((n) => {
    const e = ex.get(n.id);
    return e ? { ...n, categoria: e.categoria, comunidadeId: e.comunidadeId, contabilizar: e.contabilizar, conciliadoCom: e.conciliadoCom ?? n.conciliadoCom, sugestao: e.sugestao ?? n.sugestao } : n;
  });
}

export function agruparPorMes(contaId: string, movs: MovBanco[], quem: string): BancoLote[] {
  const g = new Map<string, BancoLote>();
  const agora = new Date().toISOString();
  for (const m of movs) {
    const ano = Number(m.data.slice(0, 4)); const mes = Number(m.data.slice(5, 7));
    const id = `${contaId}_${ano}_${String(mes).padStart(2, '0')}`;
    let l = g.get(id);
    if (!l) { l = { id, contaId, ano, mes, periodo: periodo(ano, mes), registos: [], atualizadoEm: agora, atualizadoPor: quem }; g.set(id, l); }
    l.registos.push(m);
  }
  for (const l of g.values()) l.registos.sort((a, b) => a.data.localeCompare(b.data));
  return [...g.values()];
}

/** Ordem cronológica: por data e, no mesmo dia, pela posição no extrato. */
export const ordenarMovimentos = <T extends MovBanco>(movs: T[]) =>
  [...movs].sort((a, b) => a.data.localeCompare(b.data) || (a.ordem ?? 0) - (b.ordem ?? 0));

/** Saldos e totais de um mês de uma conta (movimentos do extrato). */
export function resumoMes(movs: MovBanco[]) {
  const o = ordenarMovimentos(movs);
  const entradas = r2(o.filter((m) => m.valor > 0).reduce((s, m) => s + m.valor, 0));
  const saidas = r2(o.filter((m) => m.valor < 0).reduce((s, m) => s - m.valor, 0));
  const primeiro = o.find((m) => m.saldo != null);
  const ultimo = [...o].reverse().find((m) => m.saldo != null);
  return {
    saldoInicial: primeiro ? r2((primeiro.saldo as number) - primeiro.valor) : null,
    entradas, saidas,
    saldoFinal: ultimo ? (ultimo.saldo as number) : null,
    n: o.length,
  };
}

/**
 * Extratos sempre por mês: cada mês do ficheiro substitui o mês da conta já gravado,
 * mantendo a classificação dos movimentos que já existiam (mesmo id).
 */
export function dividirPorMes(contaId: string, movs: MovBanco[], existentes: BancoLote[], quem: string) {
  const novos = agruparPorMes(contaId, movs, quem);
  const meses = novos.map((l) => {
    const ex = existentes.find((e) => e.id === l.id);
    const classificados = new Set((ex?.registos ?? []).filter((m) => m.categoria || m.comunidadeId || m.contabilizar || m.conciliadoCom).map((m) => m.id));
    l.registos = ordenarMovimentos(fundir(l.registos, ex?.registos ?? []));
    return { periodo: l.periodo, movimentos: l.registos.length, antes: ex?.registos.length ?? 0, classificadosMantidos: l.registos.filter((m) => classificados.has(m.id)).length };
  });
  const ordem = novos.map((l, i) => ({ l, m: meses[i] })).sort((a, b) => a.l.periodo.localeCompare(b.l.periodo));
  return { lotes: ordem.map((x) => x.l), meses: ordem.map((x) => x.m) };
}
