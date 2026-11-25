/**
 * Classificação dos movimentos dos extratos com o plano financeiro: conciliação com o Jotform,
 * previsão dos custos fixos, regras por texto, memória e transferências para a comunidade Geral.
 * Regra de ouro: cada euro conta uma só vez. Os movimentos conciliados e os financeiros não entram nos resultados.
 */
import { norm, periodo as periodoDe, r2 } from './format';
import { custoAtivo, repartir, valorImputadoNoMes } from './resumos';
import { comunidadePorMbway, type Pessoa } from './pessoasBase';
import type { Categoria, CustoFixo, Lote, MovBanco, ParteMov } from './types';

/** Divisão guardada numa regra: valor fixo (positivo) ou percentagem do que sobra depois dos valores fixos. */
export interface ParteRegra { comunidadeId: string; categoria?: string; centroCusto?: string; descricao?: string; valor?: number; pct?: number }
export interface RegraBanco { id: string; padrao: string; categoria: string; fornecedor?: string; centroCusto?: string; comunidadeId?: string; ativo?: boolean; partes?: ParteRegra[] }

/**
 * Valores das linhas de uma divisão: as de valor fixo ficam (com o sinal do movimento); as percentagens aplicam-se
 * ao que sobra depois dos valores fixos. O arredondamento ao cêntimo vai para a linha de maior percentagem.
 */
export function resolverPartes(total: number, linhas: { valor?: number; pct?: number }[]): number[] {
  const sinal = total < 0 ? -1 : 1;
  const abs = Math.abs(total);
  const fixos = linhas.reduce((s0, l) => s0 + (l.pct == null ? Math.abs(l.valor ?? 0) : 0), 0);
  const resto = r2(abs - fixos);
  const out = linhas.map((l) => (l.pct == null ? r2(Math.abs(l.valor ?? 0)) : r2((resto * l.pct) / 100)));
  const comPct = linhas.map((l, i) => ({ i, p: l.pct })).filter((x) => x.p != null);
  const somaPct = comPct.reduce((s0, x) => s0 + (x.p ?? 0), 0);
  if (comPct.length && Math.abs(somaPct - 100) < 0.01) {
    const dif = r2(abs - out.reduce((s0, v) => s0 + v, 0));
    if (dif) { const maior = comPct.sort((a, b) => (b.p ?? 0) - (a.p ?? 0))[0].i; out[maior] = r2(out[maior] + dif); }
  }
  return out.map((v) => r2(sinal * v) || 0);
}

const r = (id: string, padrao: string, categoria: string, fornecedor?: string, centroCusto?: string): RegraBanco =>
  ({ id, padrao, categoria, ...(fornecedor ? { fornecedor } : {}), ...(centroCusto ? { centroCusto } : {}), ativo: true });

/** Regras iniciais (editáveis na Configuração). */
export const REGRAS_INICIAIS: RegraBanco[] = [
  r('meo', 'MEO', '02.03 Comunicações', 'MEO', 'CC02'),
  r('vodafone', 'VODAFONE', '02.03 Comunicações', 'Vodafone', 'CC02'),
  r('nos', 'NOS COMUNICACOES', '02.03 Comunicações', 'NOS', 'CC02'),
  r('edp', 'EDP', '02.02 Energia e água', 'EDP', 'CC02'),
  r('endesa', 'ENDESA', '02.02 Energia e água', 'Endesa', 'CC02'),
  r('iberdrola', 'IBERDROLA', '02.02 Energia e água', 'Iberdrola', 'CC02'),
  r('culligan', 'CULLIGAN', '02.02 Energia e água', 'Culligan', 'CC02'),
  r('securitas', 'SECURITAS', '02.06 Segurança e seguros', 'Securitas Direct', 'CC02'),
  r('prosegur', 'PROSEGUR', '02.06 Segurança e seguros', 'Prosegur', 'CC02'),
  r('anticimex', 'ANTICIMEX', '02.04 Limpeza e higiene', 'Anticimex', 'CC02'),
  r('google', 'GOOGLE', '03.04 Software e subscrições', 'Google Workspace', 'CC01'),
  r('zoom', 'ZOOM', '03.04 Software e subscrições', 'Zoom', 'CC01'),
  r('hostinger', 'HOSTINGER', '03.04 Software e subscrições', 'Hostinger', 'CC01'),
  r('inchurch', 'INCHURCH', '03.04 Software e subscrições', 'InChurch', 'CC01'),
  r('comissao', 'COMISSAO', '03.03 Bancos e pagamentos', undefined, 'CC01'),
  r('com', 'COM.', '03.03 Bancos e pagamentos', undefined, 'CC01'),
  r('selo', 'IMPOSTO DO SELO', '03.03 Bancos e pagamentos', undefined, 'CC01'),
  r('manutencao', 'MANUTENCAO DE CONTA', '03.03 Bancos e pagamentos', undefined, 'CC01'),
  r('renda', 'RENDA', '02.01 Rendas e condomínios', undefined, 'CC02'),
  r('condominio', 'CONDOMINIO', '02.01 Rendas e condomínios', undefined, 'CC02'),
];

/** Descritivo sem números, datas e referências, para reconhecer o mesmo pagamento noutros meses. */
export const chaveDescricao = (d: string) => norm(d).replace(/[0-9]+/g, ' ').replace(/[^a-z ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Palavras do banco que não identificam o fornecedor (prefixos de operação). */
const PREFIXOS = new Set(['compra', 'compras', 'trf', 'tfi', 'transf', 'transferencia', 'dd', 'debito', 'direto', 'pag', 'pagamento', 'serv', 'servicos', 'mb', 'way', 'imed', 'sepa', 'cartao', 'ref', 'pt', 'de', 'para', 'a']);
/** Texto sugerido para uma regra: as primeiras palavras do descritivo, sem prefixos do banco, números nem datas. */
export function sugerirPadrao(descricao: string): string {
  const palavras = descricao.toUpperCase().split(/[^A-ZÀ-Ý0-9]+/).filter((w) => w && !/\d/.test(w) && !PREFIXOS.has(norm(w)));
  return palavras.slice(0, 3).join(' ');
}

const eurTxt = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const dias = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
export const temPalavra = (texto: string, padrao: string) => {
  const p = norm(padrao).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9])${p}([^a-z0-9]|$)`).test(norm(texto));
};

export interface Contexto {
  categorias: Categoria[];
  regras: RegraBanco[];
  depositos: Lote[];
  despesas: Lote[];
  /** Movimentos já validados (para a memória por descritivo). */
  historico: MovBanco[];
  custosFixos: CustoFixo[];
  /** Contribuições do Contribuir (com o líquido), para conferir os lotes IFTHENPAY. */
  contribuir?: Lote[];
  /** Base de Pessoas (só Master e CAF): o MB Way mascarado de uma saída identifica a comunidade. */
  pessoas?: Pessoa[];
}

/** Reparte um valor pela previsão dos custos fixos de uma categoria (código) no mês, na proporção do valor imputado. */
export function repartirPorPrevisao(valor: number, custos: CustoFixo[], codigo: string, p: string): ParteMov[] {
  const ativos = custos.filter((c) => c.categoria?.startsWith(codigo) && custoAtivo(c, p));
  const porCom = new Map<string, number>();
  for (const c of ativos) porCom.set(c.comunidadeId, r2((porCom.get(c.comunidadeId) ?? 0) + valorImputadoNoMes(c, p)));
  const coms = [...porCom.keys()].filter((c) => porCom.get(c)! > 0);
  if (!coms.length) return [];
  const sinal = valor < 0 ? -1 : 1;
  return repartir(Math.abs(valor), coms.map((c) => porCom.get(c)!)).map((v, i) => ({ comunidadeId: coms[i], valor: r2(sinal * v) }));
}

const TRANSFERENCIA = /transf|trf|mb ?way|sepa|oferta|dizimo|donativo/;
/** Descritivos de transferências recebidas que contam sempre como oferta/dízimo da Geral. */
const OFERTA_GERAL = /^\s*tfi\b|\btrf\.?\s*mb\s*way\b|\btrf\.?\s*imed\b/;
const DIZIMO = /dizimo/;
/** Descritivos de depósitos de numerário ou cheques (CGD e Santander). */
const DEPOSITO = /\bdep(osito)?\b|\bdep\.|numerario|\bcheque/;
export const DEPOSITO_SEM_JOTFORM = 'Depósito no banco sem registo no Jotform';
const VENCIMENTO = /ordenado|salario|vencimento/;
const SEG_SOCIAL = /\btsu\b|seg(uranca)?\.? ?social|^ss\b/;

/** Propõe a classificação dos movimentos ainda por classificar. Não mexe nos validados nem nos que estão para rever. */
/** Código do reembolso sem espaços nem hífenes, em maiúsculas (R20260031). */
export const normCodigo = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');

/** "Para rever" criado pela proposta (pode voltar a ser proposto); os outros foram marcados por alguém. */
const reverAutomatico = (m: MovBanco) => (m.nota ?? '').startsWith('REVER -') || (m.nota ?? '').startsWith(DEPOSITO_SEM_JOTFORM);

/** A regra ativa que se aplica ao descritivo: a mais específica (texto mais comprido) ganha à genérica. */
export function regraDoMovimento(descricao: string, regras: RegraBanco[], existe: (categoria: string) => boolean = () => true): RegraBanco | undefined {
  return regras.filter((x) => x.ativo !== false && existe(x.categoria) && temPalavra(descricao, x.padrao))
    .sort((a, b) => norm(b.padrao).length - norm(a.padrao).length)[0];
}

function aplicarRegra(m: MovBanco, regra: RegraBanco, proposto: (patch: Partial<MovBanco>) => MovBanco): MovBanco {
  if (regra.partes?.length) {
    // Regra com divisões: valores fixos e percentagens do que sobra.
    const valores = resolverPartes(m.valor, regra.partes);
    const partes = regra.partes.map((x, i) => ({
      comunidadeId: x.comunidadeId, valor: valores[i],
      ...(x.categoria ? { categoria: x.categoria } : {}), ...(x.centroCusto ? { centroCusto: x.centroCusto } : {}), ...(x.descricao ? { descricao: x.descricao } : {}), ...(x.pct != null ? { pct: x.pct } : {}),
    }));
    return proposto({ categoria: regra.categoria, fornecedor: regra.fornecedor, centroCusto: regra.centroCusto, comunidadeId: undefined, partes, nota: `Regra "${regra.padrao}" (dividida em ${partes.length} linhas)` });
  }
  return proposto({ categoria: regra.categoria, fornecedor: regra.fornecedor, centroCusto: regra.centroCusto, comunidadeId: regra.comunidadeId ?? m.comunidadeId, nota: `Regra "${regra.padrao}"` });
}

export function proporClassificacao(movs: MovBanco[], ctx: Contexto): MovBanco[] {
  const propostos = proporSemPessoas(movs, ctx);
  if (!ctx.pessoas?.length) return propostos;
  // Saídas MB Way ainda sem comunidade: a base de Pessoas identifica-a pelo telemóvel mascarado (decisão do CAF, 25/11/2026).
  return propostos.map((r, i) => {
    if (r === movs[i] || r.valor >= 0 || r.conciliadoCom || r.partes?.length || r.comunidadeId) return r;
    const x = comunidadePorMbway(ctx.pessoas!, r.descricao);
    if (!x) return r;
    const texto = x.comunidadeId ? `MB Way ${x.mascara}: ${x.nomes.join(', ')} (Pessoas)` : `MB Way ${x.mascara}: ${x.nomes.join(', ')} (comunidades diferentes; escolha)`;
    const nota = r.estado === 'por-classificar' || !r.nota ? texto : `${r.nota} · ${texto}`;
    return { ...r, ...(x.comunidadeId ? { comunidadeId: x.comunidadeId } : {}), nota };
  });
}

function proporSemPessoas(movs: MovBanco[], ctx: Contexto): MovBanco[] {
  const cat = (codigo: string) => ctx.categorias.find((c) => c.codigo === codigo)?.nome;
  const existe = (nome: string) => ctx.categorias.some((c) => c.nome === nome && c.ativo !== false);
  const deps = ctx.depositos.flatMap((l) => l.registos.map((x) => ({ ...x, comunidadeId: l.comunidadeId, usado: false })));
  const desp = ctx.despesas.flatMap((l) => l.registos.map((x) => ({ ...x, comunidadeId: l.comunidadeId, usado: false })));
  const contrib = (ctx.contribuir ?? []).flatMap((l) => l.registos.map((x) => ({ data: x.data, liquido: Number(x.extra?.liquido), usado: false })));
  const memoria = new Map<string, MovBanco>();
  for (const h of [...ctx.historico].sort((a, b) => a.data.localeCompare(b.data))) if (h.estado === 'validado' && h.categoria && !h.conciliadoCom) memoria.set(`${h.valor > 0 ? '+' : '-'}${chaveDescricao(h.descricao)}`, h);

  return movs.map((m0) => {
    // Os "para rever" criados pela proposta (nota "REVER - …" ou depósito sem Jotform) voltam a ser propostos;
    // os validados, os conciliados e os marcados à mão ficam como estão.
    if (m0.estado === 'validado' || m0.conciliadoCom || (m0.estado === 'rever' && !reverAutomatico(m0))) return m0;
    const m: MovBanco = { ...m0, contabilizar: false };
    const d = norm(m.descricao);
    const v = Math.abs(m.valor);
    const p = periodoDe(Number(m.data.slice(0, 4)), Number(m.data.slice(5, 7)));
    const proposto = (patch: Partial<MovBanco>): MovBanco => ({ ...m, ...patch, estado: 'proposto' });
    // Dízimo só quando o descritivo o diz; sem indicação, oferta geral (o banco não distingue).
    const ofertaOuDizimo = () => ({ categoria: DIZIMO.test(d) && cat('R1.01') ? cat('R1.01') : cat('R1.02'), comunidadeId: 'bolsa-geral' });

    // 1. Estornos e IFTHENPAY (lotes do Contribuir, já contados pelo Jotform).
    if (m.estorno || /estorno/.test(d)) return proposto({ categoria: cat('F3.02'), nota: 'Estorno' });
    if (m.valor > 0 && /ifthenpay/.test(d)) {
      // Líquido das contribuições dos 7 dias anteriores ainda não atribuídas a outro lote.
      const janela = contrib.filter((x) => !x.usado && Number.isFinite(x.liquido) && dias(x.data, m.data) >= 0 && dias(x.data, m.data) <= 7);
      const soma = r2(janela.reduce((t, x) => t + x.liquido, 0));
      let nota = 'Lote IFTHENPAY do Contribuir (contado pelo Jotform)';
      if (janela.length) {
        const dif = r2(v - soma);
        if (Math.abs(dif) < 0.005) janela.forEach((x) => { x.usado = true; });
        nota += `: líquido do Contribuir nos 7 dias anteriores ${eurTxt(soma)}${Math.abs(dif) < 0.005 ? ', confere' : `, diferença ${eurTxt(Math.abs(dif))}`}`;
      }
      return proposto({ categoria: cat('F1.03'), conciliadoCom: 'contribuir:ifthenpay', nota });
    }

    // 1b. Transferências "TFI", "Trf. MB WAY" e "Trf.Imed" recebidas: sempre oferta/dízimo da comunidade Geral (decisão do CAF, 19/11/2026).
    if (m.valor > 0 && OFERTA_GERAL.test(d) && cat('R1.02')) return proposto({ ...ofertaOuDizimo(), nota: `Transferência recebida (TFI, Trf. MB WAY ou Trf.Imed): ${DIZIMO.test(d) && cat('R1.01') ? 'dízimo (indicado no descritivo)' : 'oferta (o banco não distingue; mude para Dízimos se for o caso)'}, Geral` });

    // 2. Reembolsos (código R + ano + contador) e depósitos.
    if (m.valor < 0) {
      const bruto = m.descricao.toUpperCase().match(/R[\s-]*20\d{2}[\s-]*\d{4}/)?.[0];
      const codigo = bruto ? normCodigo(bruto) : null;
      if (codigo) {
        const reg = desp.find((x) => normCodigo(String(x.extra?.codigo ?? '')) === codigo || normCodigo(x.id) === codigo);
        if (!reg) return { ...m, estado: 'rever', nota: `REVER - Dados inconsistentes: código ${codigo} não existe no Jotform (Registo de Despesas, deste ano e do anterior)` };
        if (Math.abs(reg.valor - v) >= 0.005) return { ...m, estado: 'rever', nota: `REVER - Dados inconsistentes: ${codigo} tem ${reg.valor.toFixed(2)} € no Jotform e ${v.toFixed(2)} € no banco` };
        reg.usado = true;
        return proposto({ categoria: cat('F3.02'), conciliadoCom: `despesas:${reg.id}`, comunidadeId: reg.comunidadeId, nota: `Reembolso ${codigo} (contado pelo Jotform)` });
      }
    } else {
      // Depósito do Registo de Depósitos: mesmo valor, até 7 dias antes ou depois (o registo pode ser feito depois do depósito).
      const par = deps.filter((x) => !x.usado && Math.abs(x.valor - v) < 0.005 && Math.abs(dias(x.data, m.data)) <= 7)
        .sort((a, b) => Math.abs(dias(a.data, m.data)) - Math.abs(dias(b.data, m.data)))[0];
      if (par) {
        par.usado = true;
        return proposto({ categoria: cat('F1.02'), conciliadoCom: `depositos:${par.id}`, comunidadeId: par.comunidadeId, nota: 'Depósito do Registo de Depósitos (contado pelo Jotform)' });
      }
      // Depósito no banco ainda sem registo no Jotform (decisão do CAF, 23/11/2026): conta como coleta,
      // mas a comunidade tem de ser escolhida (ou o registo de depósito feito no Jotform e a proposta refeita).
      if (DEPOSITO.test(d) && cat('R1.02')) {
        return { ...m, categoria: cat('R1.02'), contabilizar: true, estado: 'rever', nota: `${DEPOSITO_SEM_JOTFORM}: escolha a comunidade, ou registe o depósito no Jotform e volte a propor` };
      }
    }

    // 3. Regras por texto do banco (a mais específica: o texto mais comprido). Uma regra completa (com comunidade
    //    ou dividida) aplica-se já; sem comunidade, os custos fixos e a memória completam e a regra fica em último caso.
    const regra = regraDoMovimento(m.descricao, ctx.regras, existe);
    if (regra && (regra.comunidadeId || regra.partes?.length)) return aplicarRegra(m, regra, proposto);

    // 4. Fallback: vencimentos e Segurança Social pela previsão dos custos fixos.
    if (m.valor < 0 && SEG_SOCIAL.test(d) && cat('01.02')) {
      const partes = repartirPorPrevisao(m.valor, ctx.custosFixos, '01.02', p);
      return proposto({ categoria: cat('01.02'), centroCusto: 'CC03', ...(partes.length > 1 ? { partes } : partes.length ? { comunidadeId: partes[0].comunidadeId } : {}), nota: partes.length ? 'Repartida pela previsão dos custos fixos' : 'Sem previsão nos custos fixos' });
    }
    if (m.valor < 0 && cat('01.01') && (VENCIMENTO.test(d) || TRANSFERENCIA.test(d))) {
      // Cada pagamento previsto: as linhas partilhadas (incidência < 100%) com a mesma rubrica e o mesmo valor mensal total
      // são um só pagamento repartido; cada linha a 100% é um pagamento próprio. Compara-se com o valor mensal TOTAL.
      const ativos = ctx.custosFixos.filter((c) => c.categoria?.startsWith('01.01') && custoAtivo(c, p));
      const pagamentos = new Map<string, CustoFixo[]>();
      for (const c of ativos) {
        const k = (c.incidencia ?? 100) < 100 ? `${c.rubrica}|${c.valorMensal}` : `id|${c.id}`;
        pagamentos.set(k, [...(pagamentos.get(k) ?? []), c]);
      }
      let iguais = [...pagamentos.values()].filter((g) => Math.abs(g[0].valorMensal - v) < 0.005);
      if (iguais.length > 1) {
        // Mesmo valor em mais de um sítio: a memória do mesmo descritivo decide a comunidade.
        const mem = memoria.get(`-${chaveDescricao(m.descricao)}`);
        const porMem = mem?.comunidadeId ? iguais.filter((g) => g.some((c) => c.comunidadeId === mem.comunidadeId)) : [];
        // Senão, uma regra do texto do banco com comunidade (ex.: guardada no detalhe do movimento).
        const regraCom = ctx.regras.find((x) => x.ativo !== false && x.comunidadeId && temPalavra(m.descricao, x.padrao) && iguais.some((g) => g.some((c) => c.comunidadeId === x.comunidadeId)));
        const porRegra = regraCom ? iguais.filter((g) => g.some((c) => c.comunidadeId === regraCom.comunidadeId)) : [];
        if (porMem.length === 1) iguais = porMem;
        else if (porRegra.length === 1) iguais = porRegra;
      }
      if (iguais.length === 1) {
        const g = iguais[0];
        const partes = g.length > 1 ? repartirPorPrevisao(m.valor, g, '01.01', p) : [];
        return proposto({ categoria: cat('01.01'), centroCusto: 'CC03', ...(partes.length > 1 ? { partes } : { comunidadeId: g[0].comunidadeId }), nota: `Previsto nos custos fixos (${g[0].rubrica}, ${eurTxt(g[0].valorMensal)} por mês)` });
      }
      if (VENCIMENTO.test(d) && iguais.length > 1) {
        const opcoes = iguais.map((g) => g.map((c) => c.comunidadeId).join(' + ')).join(', ');
        return { ...m, categoria: cat('01.01'), centroCusto: 'CC03', estado: 'rever', nota: `REVER - ${v.toFixed(2)} € corresponde a mais de um vencimento previsto (${opcoes}): escolha a comunidade e guarde uma regra com ela (detalhe do movimento), para os próximos meses` };
      }
      if (VENCIMENTO.test(d) && ativos.length) return { ...m, categoria: cat('01.01'), centroCusto: 'CC03', estado: 'rever', nota: `REVER - Dados inconsistentes: ${v.toFixed(2)} € não corresponde a nenhum vencimento previsto` };
    }

    // 5. Memória: o mesmo descritivo já validado.
    const mem = memoria.get(`${m.valor > 0 ? '+' : '-'}${chaveDescricao(m.descricao)}`);
    if (mem && !(m.valor > 0 && TRANSFERENCIA.test(d))) {
      const { categoria, comunidadeId, centroCusto, fornecedor, contaAnalitica, projeto } = mem;
      return proposto({ categoria, comunidadeId, centroCusto, fornecedor, contaAnalitica, projeto, nota: 'Igual a um movimento já classificado' });
    }

    // 6. A regra sem comunidade, quando os custos fixos e a memória não resolveram.
    if (regra) return aplicarRegra(m, regra, proposto);

    // 6. Transferências e MB WAY diretos (entradas): ofertas da comunidade Geral (decisão do CAF).
    if (m.valor > 0 && TRANSFERENCIA.test(d) && cat('R1.02')) return proposto({ ...ofertaOuDizimo(), nota: 'Transferência ou MB WAY direto: Geral' });

    return { ...m, estado: 'por-classificar' };
  });
}

/** Valida as propostas completas (com categoria e comunidade, repartição ou conciliação). Os financeiros e os conciliados não se contabilizam. */
/** Proposta completa, pronta a validar: categoria e comunidade (ou repartida pelas comunidades, ou conciliada com o Jotform). */
export const podeValidar = (m: MovBanco) => m.estado === 'proposto' && !!m.categoria && !!(m.comunidadeId || m.partes?.length || m.conciliadoCom);

export function aceitarPropostas(movs: MovBanco[], categorias: Categoria[]): MovBanco[] {
  return movs.map((m) => (podeValidar(m) ? validar(m, categorias) : m));
}

/** Marca um movimento como validado (classificação manual). Num movimento itemizado, cada linha financeira fica fora dos resultados. */
export function validar(m: MovBanco, categorias: Categoria[]): MovBanco {
  const financeiro = (nome?: string) => categorias.some((c) => c.nome === nome && c.tipo === 'financeiro');
  if (m.partes?.length) {
    const partes = m.partes.map((p) => ({ ...p, contabilizar: !m.conciliadoCom && !financeiro(p.categoria ?? m.categoria) }));
    return { ...m, partes, estado: 'validado', contabilizar: partes.some((p) => p.contabilizar) };
  }
  return { ...m, estado: 'validado', contabilizar: !m.conciliadoCom && !financeiro(m.categoria) };
}

/** As linhas de um movimento (as partes, com o que herdam do movimento) ou o próprio movimento. */
export function pedacosDe(m: MovBanco): MovBanco[] {
  if (!m.partes?.length) return [m];
  return m.partes.map((p) => ({
    ...m, comunidadeId: p.comunidadeId, valor: p.valor, categoria: p.categoria ?? m.categoria, centroCusto: p.centroCusto ?? m.centroCusto,
    fornecedor: p.fornecedor ?? m.fornecedor, projeto: p.projeto ?? m.projeto, descricao: p.descricao ? `${m.descricao} · ${p.descricao}` : m.descricao,
    contabilizar: m.contabilizar && p.contabilizar !== false, partes: undefined,
  }));
}

export type DimensaoRelatorio = 'rubrica' | 'categoria' | 'comunidade' | 'centroCusto' | 'fornecedor' | 'projeto';
const SEM: Record<DimensaoRelatorio, string> = { rubrica: '(sem rubrica)', categoria: '(sem categoria)', comunidade: '(sem comunidade)', centroCusto: '(sem centro de custo)', fornecedor: '(sem fornecedor)', projeto: '(sem projeto)' };

/** Totais dos movimentos validados que contam nos resultados, por uma dimensão, nos meses de `de` a `ate`. */
export function relatorioExtratos(movs: MovBanco[], categorias: Categoria[], dim: DimensaoRelatorio, de: number, ate: number) {
  const rubricaDe = new Map(categorias.map((c) => [c.nome, c.rubrica ?? '']));
  const acc = new Map<string, { chave: string; receitas: number; despesas: number; n: number }>();
  const vistos = new Set<string>();
  let fora = 0; let nFora = 0; let porValidar = 0;
  for (const m of movs) {
    const mes = Number(m.data.slice(5, 7));
    if (mes < de || mes > ate) continue;
    if (m.estado !== 'validado') { porValidar++; continue; }
    if (!m.contabilizar) { fora = r2(fora + Math.abs(m.valor)); nFora++; continue; }
    for (const p of pedacosDe(m)) {
      if (!p.contabilizar) continue;
      const bruto = dim === 'rubrica' ? rubricaDe.get(p.categoria ?? '') : dim === 'comunidade' ? p.comunidadeId : p[dim];
      const chave = bruto || SEM[dim];
      const a = acc.get(chave) ?? { chave, receitas: 0, despesas: 0, n: 0 };
      if (p.valor > 0) a.receitas = r2(a.receitas + p.valor); else a.despesas = r2(a.despesas - p.valor);
      if (!vistos.has(`${chave}|${m.id}`)) { vistos.add(`${chave}|${m.id}`); a.n++; }
      acc.set(chave, a);
    }
  }
  const linhas = [...acc.values()].sort((a, b) => a.chave.localeCompare(b.chave, 'pt'));
  return { linhas, foraDosResultados: { valor: fora, n: nFora }, porValidar };
}

/**
 * Controlo do mês: o total movimentado (valores absolutos) = contabilizado + conciliado com o Jotform + financeiro
 * + para rever + proposto + por classificar. O mês está fechado quando só há contabilizado, conciliado e financeiro.
 */
export function controloMes(movs: MovBanco[]) {
  const c = { total: 0, contabilizado: 0, conciliado: 0, financeiro: 0, rever: 0, proposto: 0, porClassificar: 0 };
  for (const m of movs) {
    const v = Math.abs(m.valor);
    c.total = r2(c.total + v);
    const estado = m.estado ?? (m.contabilizar || m.conciliadoCom ? 'validado' : 'por-classificar');
    if (estado === 'validado' && !m.conciliadoCom && m.partes?.some((p) => p.contabilizar !== undefined)) {
      // Movimento itemizado: cada linha conta como contabilizada ou financeira.
      for (const p of m.partes) { const k = p.contabilizar ? 'contabilizado' : 'financeiro'; c[k] = r2(c[k] + Math.abs(p.valor)); }
      continue;
    }
    const k = estado === 'rever' ? 'rever' : estado === 'proposto' ? 'proposto' : estado === 'por-classificar' ? 'porClassificar'
      : m.conciliadoCom ? 'conciliado' : m.contabilizar ? 'contabilizado' : 'financeiro';
    c[k] = r2(c[k] + v);
  }
  return { ...c, fechado: movs.length > 0 && !c.rever && !c.proposto && !c.porClassificar };
}

/** Filtro por descrição: todas as palavras escritas aparecem no descritivo (sem distinguir maiúsculas nem acentos). */
export function descricaoContem(descricao: string, filtro: string): boolean {
  const d = norm(descricao);
  return norm(filtro).split(/\s+/).filter(Boolean).every((p) => d.includes(p));
}

/** Registo do Jotform ligado (ou candidato) a um movimento do banco. */
export interface RegistoJotform {
  origem: 'despesas' | 'depositos' | 'contribuir'; id: string; data: string; valor: number; comunidadeId: string;
  categoria?: string; descricao?: string; codigo?: string; liquido?: number; diferenca?: number;
}

const paraRegisto = (origem: RegistoJotform['origem'], l: Lote, x: Lote['registos'][number]): RegistoJotform => ({
  origem, id: x.id, data: x.data, valor: x.valor, comunidadeId: l.comunidadeId, categoria: x.categoria, descricao: x.descricao,
  ...(x.extra?.codigo ? { codigo: String(x.extra.codigo) } : {}),
  ...(Number.isFinite(Number(x.extra?.liquido)) && x.extra?.liquido != null ? { liquido: Number(x.extra.liquido) } : {}),
});

/**
 * Reembolsos do Jotform que podem corresponder a um débito do banco: até `diasJanela` dias antes ou depois
 * e com valor até `tolerancia` (10%) de diferença; os mais parecidos primeiro. `usados`: ids já conciliados noutro movimento.
 */
export function candidatosReembolso(m: MovBanco, despesas: Lote[], usados: Set<string> = new Set(), diasJanela = 7, tolerancia = 0.1): RegistoJotform[] {
  const v = Math.abs(m.valor);
  return despesas.flatMap((l) => l.registos.map((x) => paraRegisto('despesas', l, x)))
    .filter((x) => !usados.has(x.id) && dias(x.data, m.data) <= diasJanela && dias(m.data, x.data) <= diasJanela && Math.abs(x.valor - v) <= v * tolerancia + 0.005)
    .map((x) => ({ ...x, diferenca: r2(x.valor - v) }))
    .sort((a, b) => Math.abs(a.diferenca!) - Math.abs(b.diferenca!) || Math.abs(dias(a.data, m.data)) - Math.abs(dias(b.data, m.data)));
}

/** Os registos do Jotform com que um movimento está conciliado (para os ver no detalhe). */
export function registosConciliados(m: MovBanco, ctx: { despesas: Lote[]; depositos: Lote[]; contribuir: Lote[] }): RegistoJotform[] {
  const c = m.conciliadoCom ?? '';
  const [origem, resto = ''] = c.split(':');
  if (origem === 'despesas' || origem === 'depositos') {
    const ids = resto.split(',').filter(Boolean);
    const lotes = origem === 'despesas' ? ctx.despesas : ctx.depositos;
    return ids.flatMap((id) => lotes.flatMap((l) => l.registos.filter((x) => x.id === id).map((x) => paraRegisto(origem, l, x))));
  }
  if (origem === 'contribuir') {
    // Lote IFTHENPAY: as contribuições pagas nos 7 dias anteriores ao movimento (com o líquido).
    return ctx.contribuir.flatMap((l) => l.registos.map((x) => paraRegisto('contribuir', l, x)))
      .filter((x) => x.liquido != null && dias(x.data, m.data) >= 0 && dias(x.data, m.data) <= 7)
      .sort((a, b) => a.data.localeCompare(b.data));
  }
  return [];
}

// ---------- consolidação Jotform ↔ extratos (decisão do CAF, 23/11/2026) ----------
/**
 * O Contribuir, os depósitos e os reembolsos do Jotform são definitivos; o extrato só consolida e deteta diferenças:
 * - Contribuir: o líquido do mês confere com os lotes IFTHENPAY recebidos no banco;
 * - reembolsos: cada reembolso do Jotform tem uma saída na CGD ou no Santander (conciliada);
 * - depósitos: os do Jotform aparecem no banco, e os do banco sem registo no Jotform ficam assinalados.
 */
export interface Consolidacao {
  contribuir: { n: number; valor: number; liquido: number; ifthenpay: number; diferenca: number };
  reembolsos: { n: number; valor: number; confirmados: number; porConfirmar: RegistoJotform[] };
  depositos: { n: number; valor: number; confirmados: number; semExtrato: RegistoJotform[]; bancoSemJotform: MovBanco[] };
}

export function consolidacaoMes(ano: number, mes: number, ctx: { contribuir: Lote[]; despesas: Lote[]; depositos: Lote[]; banco: MovBanco[] }): Consolidacao {
  const doMes = (data: string) => Number(data.slice(0, 4)) === ano && Number(data.slice(5, 7)) === mes;
  const conciliados = new Set(ctx.banco.map((m) => m.conciliadoCom).filter((x): x is string => !!x));
  const regs = (lotes: Lote[], origem: RegistoJotform['origem']): RegistoJotform[] => lotes
    .flatMap((l) => l.registos.map((r) => ({ origem, id: r.id, data: r.data, valor: r.valor, comunidadeId: l.comunidadeId, categoria: r.categoria, descricao: r.descricao, codigo: String(r.extra?.codigo ?? '') || undefined })))
    .filter((r) => doMes(r.data));
  const contrib = ctx.contribuir.flatMap((l) => l.registos).filter((r) => doMes(r.data));
  const liquido = r2(contrib.reduce((s, r) => s + (Number.isFinite(Number(r.extra?.liquido)) ? Number(r.extra?.liquido) : r.valor), 0));
  const ifthenpay = r2(ctx.banco.filter((m) => doMes(m.data) && m.conciliadoCom === 'contribuir:ifthenpay').reduce((s, m) => s + m.valor, 0));
  const reemb = regs(ctx.despesas, 'despesas');
  const deps = regs(ctx.depositos, 'depositos');
  const confirmado = (r: RegistoJotform) => conciliados.has(`${r.origem}:${r.id}`);
  return {
    contribuir: { n: contrib.length, valor: r2(contrib.reduce((s, r) => s + r.valor, 0)), liquido, ifthenpay, diferenca: r2(ifthenpay - liquido) },
    reembolsos: { n: reemb.length, valor: r2(reemb.reduce((s, r) => s + r.valor, 0)), confirmados: reemb.filter(confirmado).length, porConfirmar: reemb.filter((r) => !confirmado(r)) },
    depositos: {
      n: deps.length, valor: r2(deps.reduce((s, r) => s + r.valor, 0)), confirmados: deps.filter(confirmado).length, semExtrato: deps.filter((r) => !confirmado(r)),
      bancoSemJotform: ctx.banco.filter((m) => doMes(m.data) && m.valor > 0 && !m.conciliadoCom && (m.nota ?? '').startsWith(DEPOSITO_SEM_JOTFORM)),
    },
  };
}
