import { describe, expect, it } from 'vitest';
import { juntarIfthenpay, lerPagamentosIfthenpay, registosIfthenpay } from '../../src/lib/ifthenpay';
import type { Lote } from '../../src/lib/types';

const CAB = ['Data Proc.', 'Data Pag.', 'Terminal', 'ID', 'Alias', 'Descrição', 'Entidade', 'Referência', 'Valor', 'Tarifa', 'Valor Líquido', 'Tipo', 'Documento  N.º', 'URL do Documento', 'Documento', 'ID do Pedido'];
const linha = (id: string, pag: unknown, valor: number, tarifa: number, liquido: number, terminal = '9-913682***-MBWAY') =>
  Object.fromEntries(CAB.map((c, i) => [c, [new Date('2026-10-04T00:00:00Z'), pag, terminal, '848', 'MBWAY | FGC-339164', '848', 'MBWAY', '848', valor, tarifa, liquido, '', '', '', '', id][i]]));
const OPC = { comunidadeId: 'almada', categoria: 'R1.02 Ofertas gerais', centroCusto: 'CC01' };

describe('pagamentos IFTHENPAY (formulários): leitura do Excel', () => {
  it('lê data de pagamento, valor, tarifa, líquido, MB Way mascarado e o ID do pedido', () => {
    const r = lerPagamentosIfthenpay({ colunas: CAB, linhas: [linha('3E59', new Date('2026-10-03T21:19:47Z'), 4, 0.12, 3.88), linha('LSeY', '03/10/2026 17:54', 1, 0.09, 0.91)] });
    expect(r.erro).toBeNull();
    expect(r.pagamentos).toEqual([
      { idPedido: '3E59', data: '2026-10-03', dataProcessamento: '2026-10-04', valor: 4, tarifa: 0.12, liquido: 3.88, tipo: 'MBWAY', terminal: '913682***', alias: 'MBWAY | FGC-339164' },
      { idPedido: 'LSeY', data: '2026-10-03', dataProcessamento: '2026-10-04', valor: 1, tarifa: 0.09, liquido: 0.91, tipo: 'MBWAY', terminal: '913682***', alias: 'MBWAY | FGC-339164' },
    ]);
  });
  it('recusa um ficheiro que não é a exportação de pagamentos da IFTHENPAY', () => {
    expect(lerPagamentosIfthenpay({ colunas: ['Data', 'Valor'], linhas: [] }).erro).toMatch(/ID do Pedido/);
  });
});

describe('gravar só uma vez', () => {
  const pags = lerPagamentosIfthenpay({ colunas: CAB, linhas: [linha('A1', new Date('2026-10-03T10:00:00Z'), 4, 0.12, 3.88), linha('A2', new Date('2026-11-02T10:00:00Z'), 10, 0.2, 9.8)] }).pagamentos;
  it('registos do portal no Contribuir, com líquido, categoria e centro de custo', () => {
    const regs = registosIfthenpay(pags, OPC, 'caf@cclx.pt', '2026-11-26T00:00:00Z');
    expect(regs[0]).toMatchObject({ id: 'portal-ifthenpay-A1', data: '2026-10-03', valor: 4, categoria: 'R1.02 Ofertas gerais',
      extra: { fonte: 'ifthenpay', liquido: 3.88, tarifa: 0.12, centroCusto: 'CC01', idPedido: 'A1', registadoPor: 'caf@cclx.pt' } });
  });
  it('guarda as dimensões opcionais: projeto ou evento, fornecedor e conta analítica', () => {
    const [r] = registosIfthenpay(pags, { ...OPC, projeto: 'Conferência 2026', fornecedor: 'IFTHENPAY', contaAnalitica: 'Ofertas online' }, 'x', 't');
    expect(r.extra).toMatchObject({ centroCusto: 'CC01', projeto: 'Conferência 2026', fornecedor: 'IFTHENPAY', contaAnalitica: 'Ofertas online' });
    const [s] = registosIfthenpay(pags, OPC, 'x', 't');
    expect(s.extra).not.toHaveProperty('projeto');
  });
  it('junta aos lotes mensais da comunidade e ignora os pedidos já importados (em qualquer comunidade)', () => {
    const regs = registosIfthenpay(pags, OPC, 'x', 't');
    const outubro: Lote = { id: 'contribuir_2026_10_almada', origem: 'contribuir', ano: 2026, mes: 10, periodo: '2026-10', comunidadeId: 'almada', total: 50, n: 1, atualizadoEm: '', atualizadoPor: '',
      registos: [{ id: 'j9', data: '2026-10-01', valor: 50, categoria: 'Dízimo', pessoa: 'Ana' }] };
    const r = juntarIfthenpay(regs, 'almada', new Map([[outubro.id, outubro]]), new Set(['portal-ifthenpay-A2']), 'x', 't');
    expect(r).toMatchObject({ novos: 1, repetidos: 1 });
    expect(r.lotes).toHaveLength(1);
    expect(r.lotes[0]).toMatchObject({ id: 'contribuir_2026_10_almada', total: 54, n: 2 });
    expect(r.lotes[0].registos.map((x) => x.id)).toEqual(['j9', 'portal-ifthenpay-A1']);
    expect(r.lotes[0].registos[0].pessoa).toBe('Ana');
  });
});

describe('reconciliação: o lote IFTHENPAY do extrato confere com os pagamentos importados', () => {
  it('o líquido dos pagamentos IFTHENPAY dos 7 dias anteriores conta na conferência', async () => {
    const { proporClassificacao } = await import('../../src/lib/classificacaoBanco');
    const { categoriasDoPlano } = await import('../../src/lib/plano');
    const pags = lerPagamentosIfthenpay({ colunas: CAB, linhas: [linha('A1', new Date('2026-10-03T10:00:00Z'), 4, 0.12, 3.88), linha('A2', new Date('2026-10-03T11:00:00Z'), 1, 0.09, 0.91)] }).pagamentos;
    const lote = juntarIfthenpay(registosIfthenpay(pags, OPC, 'x', 't'), 'almada', new Map(), new Set(), 'x', 't').lotes;
    const [m] = proporClassificacao([{ id: 'b', data: '2026-10-06', descricao: 'TRF IFTHENPAY LDA', valor: 4.79, contabilizar: false }],
      { categorias: categoriasDoPlano(), regras: [], depositos: [], despesas: [], historico: [], custosFixos: [], contribuir: lote });
    expect(m).toMatchObject({ estado: 'proposto', conciliadoCom: 'contribuir:ifthenpay' });
    expect(m.nota).toMatch(/4,79 €, confere/);
  });
});
