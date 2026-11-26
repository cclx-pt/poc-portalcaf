/**
 * Pagamentos recebidos pelos formulários da IFTHENPAY (não passam pelo Jotform). Importam-se da exportação
 * "Pagamentos" da IFTHENPAY (Excel) e entram no Contribuir como registos do portal ("portal-ifthenpay-<ID do Pedido>"):
 * contam nos resultados como as contribuições e o líquido entra na conferência dos lotes IFTHENPAY do extrato.
 * Cada pedido só se grava uma vez. Funções puras (a gravação está na página).
 */
import { norm, parseData, parseNumero, periodo, r2 } from './format';
import type { Tabela } from './ficheiros';
import type { Lote, Registo } from './types';

export interface PagamentoIfthenpay {
  idPedido: string;
  /** Data do pagamento (AAAA-MM-DD). */
  data: string;
  dataProcessamento?: string;
  valor: number;
  tarifa: number;
  liquido: number;
  tipo: string;
  /** Telemóvel mascarado do MB Way, sem o prefixo "9-" e o sufixo "-MBWAY" (ex.: 913682***). */
  terminal?: string;
  alias?: string;
}

/** Classificação dos pagamentos importados: centro de custo obrigatório; projeto, fornecedor e conta analítica opcionais. */
export interface OpcoesIfthenpay { comunidadeId: string; categoria: string; centroCusto: string; projeto?: string; fornecedor?: string; contaAnalitica?: string }

export const ID_IFTHENPAY = 'portal-ifthenpay-';

const coluna = (colunas: string[], ...nomes: string[]) => colunas.find((c) => nomes.includes(norm(c).trim()));

/** Lê a exportação de pagamentos da IFTHENPAY. */
export function lerPagamentosIfthenpay(t: Tabela): { pagamentos: PagamentoIfthenpay[]; erro: string | null; rejeitadas: number } {
  const c = {
    id: coluna(t.colunas, 'id do pedido'),
    pag: coluna(t.colunas, 'data pag', 'data pagamento'),
    proc: coluna(t.colunas, 'data proc', 'data processamento'),
    valor: coluna(t.colunas, 'valor'),
    tarifa: coluna(t.colunas, 'tarifa'),
    liquido: coluna(t.colunas, 'valor liquido'),
    tipo: coluna(t.colunas, 'tipo', 'entidade'),
    terminal: coluna(t.colunas, 'terminal'),
    alias: coluna(t.colunas, 'alias'),
  };
  if (!c.id || !c.valor || !c.liquido || !(c.pag || c.proc)) {
    return { pagamentos: [], rejeitadas: 0, erro: 'Não é a exportação de pagamentos da IFTHENPAY: faltam as colunas "ID do Pedido", "Data Pag.", "Valor" e "Valor Líquido".' };
  }
  let rejeitadas = 0;
  const pagamentos: PagamentoIfthenpay[] = [];
  for (const l of t.linhas) {
    const idPedido = String(l[c.id] ?? '').trim();
    const data = parseData(c.pag ? l[c.pag] : null) ?? parseData(c.proc ? l[c.proc] : null);
    const valor = parseNumero(l[c.valor]);
    const liquido = parseNumero(l[c.liquido]);
    if (!idPedido || !data || !Number.isFinite(valor) || !Number.isFinite(liquido)) { rejeitadas++; continue; }
    const tarifa = c.tarifa ? parseNumero(l[c.tarifa]) : NaN;
    const terminal = c.terminal ? String(l[c.terminal] ?? '').replace(/^\d-/, '').replace(/-[A-Z]+$/i, '').trim() : '';
    const proc = c.proc ? parseData(l[c.proc]) : null;
    pagamentos.push({
      idPedido, data, ...(proc ? { dataProcessamento: proc } : {}),
      valor: r2(valor), tarifa: Number.isFinite(tarifa) ? r2(tarifa) : r2(valor - liquido), liquido: r2(liquido),
      tipo: String((c.tipo ? l[c.tipo] : '') ?? '').trim() || 'IFTHENPAY',
      ...(terminal ? { terminal } : {}), ...(c.alias && l[c.alias] ? { alias: String(l[c.alias]).trim() } : {}),
    });
  }
  return { pagamentos, rejeitadas, erro: null };
}

/** Registos do Contribuir (do portal) para os pagamentos, com a comunidade, a categoria e o centro de custo escolhidos. */
export function registosIfthenpay(pags: PagamentoIfthenpay[], o: OpcoesIfthenpay, quem: string, agora: string): Registo[] {
  return pags.map((p) => ({
    id: `${ID_IFTHENPAY}${p.idPedido}`,
    data: p.data,
    valor: p.valor,
    categoria: o.categoria,
    descricao: `IFTHENPAY ${p.tipo}${p.alias ? ` · ${p.alias}` : ''}`,
    extra: {
      fonte: 'ifthenpay', idPedido: p.idPedido, liquido: p.liquido, tarifa: p.tarifa, tipo: p.tipo,
      ...(p.dataProcessamento ? { dataProcessamento: p.dataProcessamento } : {}),
      ...(p.terminal ? { terminal: p.terminal } : {}), ...(p.alias ? { alias: p.alias } : {}),
      centroCusto: o.centroCusto,
      ...(o.projeto ? { projeto: o.projeto } : {}), ...(o.fornecedor ? { fornecedor: o.fornecedor } : {}), ...(o.contaAnalitica ? { contaAnalitica: o.contaAnalitica } : {}),
      registadoPor: quem, registadoEm: agora,
    },
  }));
}

/**
 * Junta os registos aos lotes mensais do Contribuir da comunidade. `idsExistentes`: registos já gravados (em qualquer
 * comunidade); esses não se repetem. `lotes`: os lotes existentes (por id) dos meses tocados.
 */
export function juntarIfthenpay(regs: Registo[], comunidadeId: string, lotes: Map<string, Lote>, idsExistentes: Set<string>, quem: string, agora: string) {
  const novos = regs.filter((r) => !idsExistentes.has(r.id));
  const porLote = new Map<string, Lote>();
  for (const r of novos) {
    const ano = Number(r.data.slice(0, 4));
    const mes = Number(r.data.slice(5, 7));
    const id = `contribuir_${ano}_${String(mes).padStart(2, '0')}_${comunidadeId}`;
    const base = porLote.get(id) ?? lotes.get(id) ?? { id, origem: 'contribuir', ano, mes, periodo: periodo(ano, mes), comunidadeId, registos: [], total: 0, n: 0, atualizadoEm: agora, atualizadoPor: quem } as Lote;
    const registos = [...base.registos, r].sort((a, b) => a.data.localeCompare(b.data));
    porLote.set(id, { ...base, registos, total: r2(registos.reduce((s, x) => s + x.valor, 0)), n: registos.length, atualizadoEm: agora, atualizadoPor: quem });
  }
  return { lotes: [...porLote.values()], novos: novos.length, repetidos: regs.length - novos.length };
}
