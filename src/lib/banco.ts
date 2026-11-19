import { MESES, eur, norm, parseData, parseNumero, periodo, r2 } from './format';
import type { Linha } from './fontes';
import type { BancoLote, Lote, MovBanco } from './types';

export interface MapaBanco { data?: string; descricao?: string; valor?: string; debito?: string; credito?: string; saldo?: string; estorno?: string }

export type Banco = 'cgd' | 'santander';

/** Mapeamento de colunas do extrato de uma conta (guardado na própria conta, em Configuração). */
export interface MapaExtrato {
  id: string;
  nome: string;
  contaId: string;
  /** Assinatura das colunas do ficheiro de exemplo (normalizadas e ordenadas). */
  colunas: string[];
  campos: MapaBanco;
}

/** Os mapeamentos das contas que os têm definidos. */
export const mapasDasContas = (contas: { id: string; nome: string; mapa?: MapaBanco; mapaColunas?: string[]; ativo?: boolean }[]): MapaExtrato[] =>
  contas.filter((c) => c.ativo !== false && c.mapa && mapaCompleto(c.mapa))
    .map((c) => ({ id: c.id, nome: c.nome, contaId: c.id, colunas: assinaturaColunas(c.mapaColunas ?? []), campos: c.mapa! }));

export const assinaturaColunas = (colunas: string[]) => [...new Set(colunas.map((c) => norm(c)).filter(Boolean))].sort();

export const mapaCompleto = (m: MapaBanco) => !!m.data && !!(m.valor || m.debito || m.credito);

/** Mapeamento guardado que serve a este ficheiro (mesmas colunas; senão, todas as colunas usadas existem), já com os nomes do ficheiro. */
export function escolherMapa(colunas: string[], mapas: MapaExtrato[]): MapaExtrato | null {
  const porNorm = new Map(colunas.map((c) => [norm(c), c]));
  const ass = assinaturaColunas(colunas).join('|');
  const usadas = (x: MapaExtrato) => Object.values(x.campos).filter((v): v is string => !!v);
  const serve = (x: MapaExtrato) => mapaCompleto(x.campos) && usadas(x).every((v) => porNorm.has(norm(v)));
  const m = mapas.find((x) => x.colunas.join('|') === ass && serve(x))
    ?? mapas.filter(serve).sort((a, b) => usadas(b).length - usadas(a).length)[0];
  if (!m) return null;
  const campos: MapaBanco = {};
  for (const [k, v] of Object.entries(m.campos)) if (v) campos[k as keyof MapaBanco] = porNorm.get(norm(v));
  return { ...m, campos };
}
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
    if (!e) return n;
    const { categoria, comunidadeId, contabilizar, estado, nota, contaAnalitica, fornecedor, centroCusto, projeto, documento, partes } = e;
    return { ...n, categoria, comunidadeId, contabilizar, estado, nota, contaAnalitica, fornecedor, centroCusto, projeto, documento, partes, conciliadoCom: e.conciliadoCom ?? n.conciliadoCom, sugestao: e.sugestao ?? n.sugestao };
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

// ---------- vista de saldos ----------
const classificado = (m: MovBanco) => !!(m.categoria || m.comunidadeId || m.contabilizar || m.conciliadoCom);
export type ResumoConta = ReturnType<typeof resumoMes> & { classificados: number; conciliados: number };
export interface SaldoMes {
  mes: number;
  contas: Record<string, ResumoConta | null>;
  /** Soma das contas com extrato nesse mês (null se nenhuma tem). */
  total: { saldoInicial: number | null; entradas: number; saidas: number; saldoFinal: number | null } | null;
}

/** Saldos de janeiro a dezembro, por conta e total. */
export function saldosMensais(lotes: BancoLote[], contaIds: string[]): SaldoMes[] {
  return Array.from({ length: 12 }, (_, i) => {
    const mes = i + 1;
    const contas: SaldoMes['contas'] = {};
    for (const c of contaIds) {
      const movs = lotes.filter((l) => l.contaId === c && l.mes === mes).flatMap((l) => l.registos);
      contas[c] = movs.length ? { ...resumoMes(movs), classificados: movs.filter(classificado).length, conciliados: movs.filter((m) => m.conciliadoCom).length } : null;
    }
    const com = Object.values(contas).filter((x): x is ResumoConta => !!x);
    const soma = (f: (x: ResumoConta) => number | null) => { const v = com.map(f).filter((x): x is number => x != null); return v.length ? r2(v.reduce((a, b) => a + b, 0)) : null; };
    return { mes, contas, total: com.length ? { saldoInicial: soma((x) => x.saldoInicial), entradas: soma((x) => x.entradas) ?? 0, saidas: soma((x) => x.saidas) ?? 0, saldoFinal: soma((x) => x.saldoFinal) } : null };
  });
}

/** Médias e extremos dos meses com extrato (sobre o total das contas). */
export function estatisticasSaldos(s: SaldoMes[]) {
  const com = s.filter((x) => x.total);
  const n = com.length;
  const media = (f: (x: SaldoMes) => number) => (n ? r2(com.reduce((a, x) => a + f(x), 0) / n) : null);
  const saldos = com.filter((x) => x.total!.saldoFinal != null).map((x) => ({ mes: x.mes, valor: x.total!.saldoFinal as number }));
  const ext = (cmp: (a: number, b: number) => boolean) => saldos.reduce<{ mes: number; valor: number } | null>((m, x) => (!m || cmp(x.valor, m.valor) ? x : m), null);
  const maisSaidas = com.reduce<{ mes: number; valor: number } | null>((m, x) => (!m || x.total!.saidas > m.valor ? { mes: x.mes, valor: x.total!.saidas } : m), null);
  return {
    meses: n,
    entradasMedia: media((x) => x.total!.entradas), saidasMedia: media((x) => x.total!.saidas),
    saldoMedio: saldos.length ? r2(saldos.reduce((a, x) => a + x.valor, 0) / saldos.length) : null,
    saldoMinimo: ext((a, b) => a < b), saldoMaximo: ext((a, b) => a > b), maisSaidas,
  };
}

export interface AvisoExtrato { contaId: string; tipo: 'mes-em-falta' | 'saldo-nao-encadeia' | 'saldo-interno'; mes: number; texto: string }

/** Verifica os extratos: meses em falta, saldos que não encadeiam entre meses e saldos que não batem dentro do mês. */
export function verificarExtratos(lotes: BancoLote[], contaIds: string[]): AvisoExtrato[] {
  const avisos: AvisoExtrato[] = [];
  for (const c of contaIds) {
    const meses = [...new Set(lotes.filter((l) => l.contaId === c && l.registos.length).map((l) => l.mes))].sort((a, b) => a - b);
    if (!meses.length) continue;
    const movsDe = (mes: number) => ordenarMovimentos(lotes.filter((l) => l.contaId === c && l.mes === mes).flatMap((l) => l.registos));
    for (let m = meses[0]; m <= meses[meses.length - 1]; m++) if (!meses.includes(m)) avisos.push({ contaId: c, tipo: 'mes-em-falta', mes: m, texto: `Falta o extrato de ${MESES[m - 1]}.` });
    let anterior: number | null = null;
    for (const mes of meses) {
      const movs = movsDe(mes);
      const r = resumoMes(movs);
      if (anterior != null && r.saldoInicial != null && Math.abs(r.saldoInicial - anterior) > 0.005) {
        avisos.push({ contaId: c, tipo: 'saldo-nao-encadeia', mes, texto: `O saldo inicial de ${MESES[mes - 1]} (${eur(r.saldoInicial)}) não é igual ao final do mês anterior (${eur(anterior)}).` });
      }
      // Dentro do mês: cada saldo = saldo anterior + movimento (os estornos não mexem no saldo).
      let quebras = 0; let s: number | null = null;
      for (const m of movs) {
        if (m.saldo == null) continue;
        if (s != null && !m.estorno && Math.abs(s + m.valor - m.saldo) > 0.005) quebras++;
        s = m.saldo;
      }
      if (quebras) avisos.push({ contaId: c, tipo: 'saldo-interno', mes, texto: `${quebras} ${quebras === 1 ? 'movimento' : 'movimentos'} em ${MESES[mes - 1]} com saldo que não bate com o anterior.` });
      anterior = r.saldoFinal;
    }
  }
  return avisos;
}

/** Maiores entradas e saídas (por valor). */
export function maioresMovimentos<T extends MovBanco>(movs: T[], n = 5) {
  return {
    entradas: movs.filter((m) => m.valor > 0).sort((a, b) => b.valor - a.valor).slice(0, n),
    saidas: movs.filter((m) => m.valor < 0).sort((a, b) => a.valor - b.valor).slice(0, n),
  };
}

/** Saldo previsto até dezembro: último saldo total + média do movimento líquido dos últimos k meses com extrato. */
export function previsaoSaldos(s: SaldoMes[], k = 3) {
  const com = s.filter((x) => x.total && x.total.saldoFinal != null);
  if (!com.length) return [];
  const ultimo = com[com.length - 1];
  const base = com.slice(-k);
  const liquido = base.reduce((a, x) => a + x.total!.entradas - x.total!.saidas, 0) / base.length;
  const out: { mes: number; saldo: number }[] = [];
  let saldo = ultimo.total!.saldoFinal as number;
  for (let mes = ultimo.mes + 1; mes <= 12; mes++) { saldo = r2(saldo + liquido); out.push({ mes, saldo }); }
  return out;
}

/** Meses com extrato importado, para limpar: os fechados aparecem marcados e não se podem escolher. */
export function mesesParaLimpar(lotes: BancoLote[], fechados: Set<string>) {
  const porMes = new Map<number, { mes: number; periodo: string; fechado: boolean; movimentos: number; contas: string[] }>();
  for (const l of lotes) {
    if (!l.registos.length) continue;
    const x = porMes.get(l.mes) ?? { mes: l.mes, periodo: l.periodo, fechado: fechados.has(l.periodo), movimentos: 0, contas: [] };
    x.movimentos += l.registos.length;
    if (!x.contas.includes(l.contaId)) x.contas.push(l.contaId);
    porMes.set(l.mes, x);
  }
  return [...porMes.values()].sort((a, b) => a.mes - b.mes).map((x) => ({ ...x, contas: x.contas.sort() }));
}
