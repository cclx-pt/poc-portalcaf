/**
 * Classificação dos movimentos dos extratos com o plano financeiro: conciliação com o Jotform,
 * previsão dos custos fixos, regras por texto, memória e transferências para a comunidade Geral.
 * Regra de ouro: cada euro conta uma só vez. Os movimentos conciliados e os financeiros não entram nos resultados.
 */
import { norm, periodo as periodoDe, r2 } from './format';
import { custoAtivo, repartir, valorImputado } from './resumos';
import type { Categoria, CustoFixo, Lote, MovBanco, ParteMov } from './types';

export interface RegraBanco { id: string; padrao: string; categoria: string; fornecedor?: string; centroCusto?: string; comunidadeId?: string; ativo?: boolean }

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

const eurTxt = (n: number) => `${n.toFixed(2).replace('.', ',')} €`;
const dias = (a: string, b: string) => (new Date(b).getTime() - new Date(a).getTime()) / 86400000;
const temPalavra = (texto: string, padrao: string) => {
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
}

/** Reparte um valor pela previsão dos custos fixos de uma categoria (código) no mês, na proporção do valor imputado. */
export function repartirPorPrevisao(valor: number, custos: CustoFixo[], codigo: string, p: string): ParteMov[] {
  const ativos = custos.filter((c) => c.categoria?.startsWith(codigo) && custoAtivo(c, p));
  const porCom = new Map<string, number>();
  for (const c of ativos) porCom.set(c.comunidadeId, r2((porCom.get(c.comunidadeId) ?? 0) + valorImputado(c)));
  const coms = [...porCom.keys()];
  if (!coms.length) return [];
  const sinal = valor < 0 ? -1 : 1;
  return repartir(Math.abs(valor), coms.map((c) => porCom.get(c)!)).map((v, i) => ({ comunidadeId: coms[i], valor: r2(sinal * v) }));
}

const TRANSFERENCIA = /transf|trf|mb ?way|sepa|oferta|dizimo|donativo/;
const VENCIMENTO = /ordenado|salario|vencimento/;
const SEG_SOCIAL = /\btsu\b|seg(uranca)?\.? ?social|^ss\b/;

/** Propõe a classificação dos movimentos ainda por classificar. Não mexe nos validados nem nos que estão para rever. */
export function proporClassificacao(movs: MovBanco[], ctx: Contexto): MovBanco[] {
  const cat = (codigo: string) => ctx.categorias.find((c) => c.codigo === codigo)?.nome;
  const existe = (nome: string) => ctx.categorias.some((c) => c.nome === nome && c.ativo !== false);
  const deps = ctx.depositos.flatMap((l) => l.registos.map((x) => ({ ...x, comunidadeId: l.comunidadeId, usado: false })));
  const desp = ctx.despesas.flatMap((l) => l.registos.map((x) => ({ ...x, comunidadeId: l.comunidadeId, usado: false })));
  const contrib = (ctx.contribuir ?? []).flatMap((l) => l.registos.map((x) => ({ data: x.data, liquido: Number(x.extra?.liquido), usado: false })));
  const memoria = new Map<string, MovBanco>();
  for (const h of [...ctx.historico].sort((a, b) => a.data.localeCompare(b.data))) if (h.estado === 'validado' && h.categoria && !h.conciliadoCom) memoria.set(`${h.valor > 0 ? '+' : '-'}${chaveDescricao(h.descricao)}`, h);

  return movs.map((m0) => {
    if (m0.estado === 'validado' || m0.estado === 'rever' || m0.conciliadoCom) return m0;
    const m: MovBanco = { ...m0, contabilizar: false };
    const d = norm(m.descricao);
    const v = Math.abs(m.valor);
    const p = periodoDe(Number(m.data.slice(0, 4)), Number(m.data.slice(5, 7)));
    const proposto = (patch: Partial<MovBanco>): MovBanco => ({ ...m, ...patch, estado: 'proposto' });

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

    // 2. Reembolsos (código R + ano + contador) e depósitos.
    if (m.valor < 0) {
      const codigo = m.descricao.toUpperCase().match(/R20\d{6}/)?.[0];
      if (codigo) {
        const reg = desp.find((x) => x.extra?.codigo === codigo || x.id === codigo);
        if (!reg) return { ...m, estado: 'rever', nota: `REVER - Dados inconsistentes: código ${codigo} não existe no Jotform` };
        if (Math.abs(reg.valor - v) >= 0.005) return { ...m, estado: 'rever', nota: `REVER - Dados inconsistentes: ${codigo} tem ${reg.valor.toFixed(2)} € no Jotform e ${v.toFixed(2)} € no banco` };
        reg.usado = true;
        return proposto({ categoria: cat('F3.02'), conciliadoCom: `despesas:${reg.id}`, comunidadeId: reg.comunidadeId, nota: `Reembolso ${codigo} (contado pelo Jotform)` });
      }
    } else {
      const par = deps.find((x) => !x.usado && Math.abs(x.valor - v) < 0.005 && dias(x.data, m.data) >= 0 && dias(x.data, m.data) <= 3);
      if (par) {
        par.usado = true;
        return proposto({ categoria: cat('F1.02'), conciliadoCom: `depositos:${par.id}`, comunidadeId: par.comunidadeId, nota: 'Depósito do Registo de Depósitos (contado pelo Jotform)' });
      }
    }

    // 3. Vencimentos e Segurança Social pela previsão dos custos fixos.
    if (m.valor < 0 && SEG_SOCIAL.test(d) && cat('01.02')) {
      const partes = repartirPorPrevisao(m.valor, ctx.custosFixos, '01.02', p);
      return proposto({ categoria: cat('01.02'), centroCusto: 'CC03', ...(partes.length > 1 ? { partes } : partes.length ? { comunidadeId: partes[0].comunidadeId } : {}), nota: partes.length ? 'Repartida pela previsão dos custos fixos' : 'Sem previsão nos custos fixos' });
    }
    if (m.valor < 0 && VENCIMENTO.test(d) && cat('01.01')) {
      const ativos = ctx.custosFixos.filter((c) => c.categoria?.startsWith('01.01') && custoAtivo(c, p));
      const grupos = new Map<string, CustoFixo[]>();
      for (const c of ativos) grupos.set(c.rubrica, [...(grupos.get(c.rubrica) ?? []), c]);
      const igual = [...grupos.values()].find((g) => Math.abs(g[0].valorMensal - v) < 0.005);
      if (igual) {
        const partes = igual.length > 1 ? repartirPorPrevisao(m.valor, igual, '01.01', p) : [];
        return proposto({ categoria: cat('01.01'), centroCusto: 'CC03', ...(partes.length ? { partes } : { comunidadeId: igual[0].comunidadeId }), nota: `Previsto nos custos fixos (${igual[0].rubrica})` });
      }
      if (ativos.length) return { ...m, categoria: cat('01.01'), centroCusto: 'CC03', estado: 'rever', nota: `REVER - Dados inconsistentes: ${v.toFixed(2)} € não corresponde a nenhum vencimento previsto` };
    }

    // 4. Memória: o mesmo descritivo já validado.
    const mem = memoria.get(`${m.valor > 0 ? '+' : '-'}${chaveDescricao(m.descricao)}`);
    if (mem && !(m.valor > 0 && TRANSFERENCIA.test(d))) {
      const { categoria, comunidadeId, centroCusto, fornecedor, contaAnalitica, projeto } = mem;
      return proposto({ categoria, comunidadeId, centroCusto, fornecedor, contaAnalitica, projeto, nota: 'Igual a um movimento já classificado' });
    }

    // 5. Regras por texto do banco.
    const regra = ctx.regras.find((x) => x.ativo !== false && existe(x.categoria) && temPalavra(m.descricao, x.padrao));
    if (regra) return proposto({ categoria: regra.categoria, fornecedor: regra.fornecedor, centroCusto: regra.centroCusto, comunidadeId: regra.comunidadeId ?? m.comunidadeId, nota: `Regra "${regra.padrao}"` });

    // 6. Transferências e MB WAY diretos (entradas): ofertas da comunidade Geral (decisão do CAF).
    if (m.valor > 0 && TRANSFERENCIA.test(d) && cat('R1.02')) return proposto({ categoria: cat('R1.02'), comunidadeId: 'bolsa-geral', nota: 'Transferência ou MB WAY direto: Geral' });

    return { ...m, estado: 'por-classificar' };
  });
}

/** Valida as propostas completas (com categoria e comunidade, repartição ou conciliação). Os financeiros e os conciliados não se contabilizam. */
export function aceitarPropostas(movs: MovBanco[], categorias: Categoria[]): MovBanco[] {
  const financeiro = (nome?: string) => categorias.some((c) => c.nome === nome && c.tipo === 'financeiro');
  return movs.map((m) => {
    if (m.estado !== 'proposto' || !m.categoria || !(m.comunidadeId || m.partes?.length || m.conciliadoCom)) return m;
    return { ...m, estado: 'validado', contabilizar: !m.conciliadoCom && !financeiro(m.categoria) };
  });
}

/** Marca um movimento como validado (classificação manual). */
export function validar(m: MovBanco, categorias: Categoria[]): MovBanco {
  const financeiro = categorias.some((c) => c.nome === m.categoria && c.tipo === 'financeiro');
  return { ...m, estado: 'validado', contabilizar: !m.conciliadoCom && !financeiro };
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
    const pedacos = m.partes?.length ? m.partes.map((p) => ({ ...m, comunidadeId: p.comunidadeId, valor: p.valor, centroCusto: p.centroCusto ?? m.centroCusto })) : [m];
    for (const p of pedacos) {
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
