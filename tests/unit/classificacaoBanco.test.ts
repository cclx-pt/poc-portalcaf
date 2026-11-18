import { describe, expect, it } from 'vitest';
import { REGRAS_INICIAIS, aceitarPropostas, chaveDescricao, proporClassificacao, repartirPorPrevisao } from '../../src/lib/classificacaoBanco';
import { categoriasDoPlano } from '../../src/lib/plano';
import type { CustoFixo, Lote, MovBanco } from '../../src/lib/types';

const cats = categoriasDoPlano();
const mov = (id: string, data: string, valor: number, descricao: string, extra: Partial<MovBanco> = {}): MovBanco => ({ id, data, valor, descricao, contabilizar: false, ...extra });
const lote = (origem: Lote['origem'], comunidadeId: string, regs: { id: string; data: string; valor: number; extra?: Record<string, string> }[]): Lote => ({
  id: `${origem}_${comunidadeId}`, origem, ano: 2026, mes: 3, periodo: '2026-03', comunidadeId, total: 0, n: regs.length, atualizadoEm: '', atualizadoPor: '',
  registos: regs.map((r) => ({ ...r, categoria: 'x' })),
});
const ctx = (o: Partial<Parameters<typeof proporClassificacao>[1]> = {}) => ({ categorias: cats, regras: REGRAS_INICIAIS, depositos: [], despesas: [], historico: [], custosFixos: [], ...o });

describe('proposta de classificação dos extratos', () => {
  it('depósito com registo no Jotform: conciliado, financeiro (F1.02), comunidade do registo', () => {
    const [m] = proporClassificacao([mov('1', '2026-03-03', 135, 'DEPOSITO')], ctx({ depositos: [lote('depositos', 'moita', [{ id: 'd1', data: '2026-03-02', valor: 135 }])] }));
    expect(m).toMatchObject({ estado: 'proposto', categoria: 'F1.02 Depósitos de numerário', comunidadeId: 'moita', conciliadoCom: 'depositos:d1', contabilizar: false });
  });
  it('reembolso: código R com valor igual concilia; com valor diferente fica para rever', () => {
    const despesas = [lote('despesas', 'almada', [{ id: 's1', data: '2026-03-01', valor: 40, extra: { codigo: 'R20260455' } }])];
    const [ok] = proporClassificacao([mov('1', '2026-03-05', -40, 'TRF R20260455 REEMB')], ctx({ despesas }));
    expect(ok).toMatchObject({ estado: 'proposto', categoria: 'F3.02 Reembolsos e estornos', conciliadoCom: 'despesas:s1', comunidadeId: 'almada' });
    const [mau] = proporClassificacao([mov('2', '2026-03-05', -45, 'TRF R20260455 REEMB')], ctx({ despesas }));
    expect(mau.estado).toBe('rever');
    expect(mau.nota).toMatch(/Dados inconsistentes/);
    expect(mau.conciliadoCom ?? null).toBeNull();
  });
  it('IFTHENPAY (Contribuir) e estornos ficam como financeiros', () => {
    const [i, e] = proporClassificacao([mov('1', '2026-03-05', 300, 'TRF IFTHENPAY LDA'), mov('2', '2026-03-05', 10, 'ESTORNO', { estorno: true })], ctx());
    expect(i).toMatchObject({ categoria: 'F1.03 Regularização de tesouraria', conciliadoCom: 'contribuir:ifthenpay', estado: 'proposto' });
    expect(e).toMatchObject({ categoria: 'F3.02 Reembolsos e estornos', estado: 'proposto' });
  });
  it('regras por texto: fornecedor, categoria e centro de custo', () => {
    const [m] = proporClassificacao([mov('1', '2026-03-05', -45.5, 'DD MEO SA 123456')], ctx());
    expect(m).toMatchObject({ estado: 'proposto', categoria: '02.03 Comunicações', fornecedor: 'MEO' });
  });
  it('memória: descritivo já validado recebe a mesma classificação', () => {
    const historico = [mov('h', '2026-02-05', -60, 'COMPRA 1234 GARAGEM ALMADA 02/02', { estado: 'validado', categoria: '02.01 Rendas e condomínios', comunidadeId: 'almada', centroCusto: 'CC02' })];
    const [m] = proporClassificacao([mov('1', '2026-03-05', -60, 'COMPRA 9876 GARAGEM ALMADA 03/03')], ctx({ historico }));
    expect(m).toMatchObject({ estado: 'proposto', categoria: '02.01 Rendas e condomínios', comunidadeId: 'almada', centroCusto: 'CC02' });
    expect(chaveDescricao('COMPRA 1234 GARAGEM ALMADA 02/02')).toBe(chaveDescricao('COMPRA 9876 GARAGEM ALMADA 03/03'));
  });
  it('transferências e MB WAY de entrada sem outra correspondência: ofertas gerais na comunidade Geral', () => {
    const [m] = proporClassificacao([mov('1', '2026-03-05', 50, 'TRF MB WAY DE JOAO')], ctx());
    expect(m).toMatchObject({ estado: 'proposto', categoria: 'R1.02 Ofertas gerais', comunidadeId: 'bolsa-geral' });
  });
  it('vencimento igual ao previsto nos custos fixos: comunidade do custo; repartido se partilhado', () => {
    const cf = (id: string, com: string, inc: number): CustoFixo => ({ id, comunidadeId: com, rubrica: 'Vencimento Pastoral', categoria: '01.01 Remunerações e subsídios', valorMensal: 1500, incidencia: inc, ano: 2026, inicio: '2026-01', fim: '2026-12', nivel: 'confidencial' });
    const [m] = proporClassificacao([mov('1', '2026-03-28', -1500, 'TRF ORDENADO MARCO')], ctx({ custosFixos: [cf('a', 'moita', 50), cf('b', 'sede', 50)] }));
    expect(m).toMatchObject({ estado: 'proposto', categoria: '01.01 Remunerações e subsídios', centroCusto: 'CC03' });
    expect(m.partes).toEqual([{ comunidadeId: 'moita', valor: -750 }, { comunidadeId: 'sede', valor: -750 }]);
  });
  it('Segurança Social paga junta: repartida pela previsão do mês', () => {
    const cf = (id: string, com: string, v: number): CustoFixo => ({ id, comunidadeId: com, rubrica: 'Segurança Social · X', categoria: '01.02 Segurança Social e retenções', valorMensal: v, ano: 2026, inicio: '2026-01', fim: '2026-12', nivel: 'confidencial' });
    const partes = repartirPorPrevisao(-300, [cf('a', 'moita', 100), cf('b', 'sede', 200)], '01.02', '2026-03');
    expect(partes).toEqual([{ comunidadeId: 'moita', valor: -100 }, { comunidadeId: 'sede', valor: -200 }]);
    expect(repartirPorPrevisao(-301, [cf('a', 'moita', 100), cf('b', 'sede', 200)], '01.02', '2026-03').reduce((s, p) => s + p.valor, 0)).toBeCloseTo(-301, 2);
  });
  it('não mexe em movimentos já validados ou para rever, e o resto fica por classificar', () => {
    const [v, n] = proporClassificacao([mov('1', '2026-03-05', -10, 'X', { estado: 'validado', categoria: '09.03 Outros gastos identificados' }), mov('2', '2026-03-05', -7, 'COISA ESTRANHA')], ctx());
    expect(v.categoria).toBe('09.03 Outros gastos identificados');
    expect(n.estado).toBe('por-classificar');
  });
  it('aceitar propostas valida as propostas (não as que estão para rever) e marca para contabilizar só as não financeiras', () => {
    const r = aceitarPropostas([
      mov('1', '2026-03-05', -45, 'MEO', { estado: 'proposto', categoria: '02.03 Comunicações', comunidadeId: 'almada' }),
      mov('2', '2026-03-05', 135, 'DEP', { estado: 'proposto', categoria: 'F1.02 Depósitos de numerário', conciliadoCom: 'depositos:d1' }),
      mov('3', '2026-03-05', -45, 'R', { estado: 'rever' }),
      mov('4', '2026-03-05', -45, 'Y', { estado: 'proposto', categoria: '02.03 Comunicações' }),
    ], cats);
    expect(r.map((m) => [m.estado, m.contabilizar])).toEqual([['validado', true], ['validado', false], ['rever', false], ['proposto', false]]);
  });
});

describe('relatório dos extratos por dimensão', () => {
  it('soma os movimentos validados (com partes), separando financeiros e conciliados', async () => {
    const { relatorioExtratos } = await import('../../src/lib/classificacaoBanco');
    const movs: MovBanco[] = [
      mov('1', '2026-03-05', -45, 'MEO', { estado: 'validado', contabilizar: true, categoria: '02.03 Comunicações', comunidadeId: 'almada', fornecedor: 'MEO', centroCusto: 'CC02' }),
      mov('2', '2026-03-06', -300, 'TSU', { estado: 'validado', contabilizar: true, categoria: '01.02 Segurança Social e retenções', partes: [{ comunidadeId: 'almada', valor: -100 }, { comunidadeId: 'porto', valor: -200 }] }),
      mov('3', '2026-03-07', 135, 'DEP', { estado: 'validado', contabilizar: false, categoria: 'F1.02 Depósitos de numerário', conciliadoCom: 'depositos:d1', comunidadeId: 'moita' }),
      mov('4', '2026-03-08', 50, 'MBWAY', { estado: 'validado', contabilizar: true, categoria: 'R1.02 Ofertas gerais', comunidadeId: 'bolsa-geral' }),
      mov('5', '2026-04-01', -10, 'X', { estado: 'proposto', categoria: '02.03 Comunicações' }),
    ];
    const r = relatorioExtratos(movs, cats, 'comunidade', 1, 12);
    expect(r.linhas).toEqual([
      { chave: 'almada', receitas: 0, despesas: 145, n: 2 },
      { chave: 'bolsa-geral', receitas: 50, despesas: 0, n: 1 },
      { chave: 'porto', receitas: 0, despesas: 200, n: 1 },
    ]);
    expect(r.foraDosResultados).toEqual({ valor: 135, n: 1 });
    expect(r.porValidar).toBe(1);
    expect(relatorioExtratos(movs, cats, 'rubrica', 1, 12).linhas.map((l) => l.chave)).toEqual(['01 Pessoal', '02 Instalações', 'R1 Dízimos e ofertas']);
    expect(relatorioExtratos(movs, cats, 'fornecedor', 3, 3).linhas[0]).toEqual({ chave: '(sem fornecedor)', receitas: 50, despesas: 300, n: 2 });
  });
});

describe('IFTHENPAY com o líquido do Contribuir', () => {
  it('compara o lote com a soma do líquido dos dias anteriores ainda não usados', () => {
    const c = lote('contribuir', 'almada', [
      { id: 'c1', data: '2026-03-02', valor: 50, extra: { liquido: '48.90' } },
      { id: 'c2', data: '2026-03-03', valor: 20, extra: { liquido: '19.40' } },
    ]);
    const [m] = proporClassificacao([mov('1', '2026-03-05', 68.3, 'TRF IFTHENPAY LDA')], ctx({ contribuir: [c] }));
    expect(m.conciliadoCom).toBe('contribuir:ifthenpay');
    expect(m.nota).toMatch(/68,30 €.*confere/);
    const [d] = proporClassificacao([mov('1', '2026-03-05', 60, 'TRF IFTHENPAY LDA')], ctx({ contribuir: [c] }));
    expect(d.nota).toMatch(/diferença 8,30 €/);
  });
});

describe('controlo do mês (cada euro conta uma vez)', () => {
  it('reparte o total do extrato pelos estados e confere a soma', async () => {
    const { controloMes } = await import('../../src/lib/classificacaoBanco');
    const c = controloMes([
      mov('1', '2026-03-05', -45, 'MEO', { estado: 'validado', contabilizar: true, categoria: '02.03 Comunicações', comunidadeId: 'almada' }),
      mov('2', '2026-03-05', 135, 'DEP', { estado: 'validado', contabilizar: false, categoria: 'F1.02 Depósitos de numerário', conciliadoCom: 'depositos:d1' }),
      mov('3', '2026-03-05', 300, 'IF', { estado: 'validado', contabilizar: false, categoria: 'F1.03 Regularização de tesouraria', conciliadoCom: 'contribuir:ifthenpay' }),
      mov('4', '2026-03-05', -1000, 'TRF', { estado: 'validado', contabilizar: false, categoria: 'F1.01 Transferências internas' }),
      mov('5', '2026-03-05', -20, 'R', { estado: 'rever' }),
      mov('6', '2026-03-05', -7, 'X', { estado: 'proposto', categoria: '02.03 Comunicações' }),
      mov('7', '2026-03-05', 9, 'Y'),
    ]);
    expect(c).toEqual({ total: 1516, contabilizado: 45, conciliado: 435, financeiro: 1000, rever: 20, proposto: 7, porClassificar: 9, fechado: false });
    expect(c.contabilizado + c.conciliado + c.financeiro + c.rever + c.proposto + c.porClassificar).toBe(c.total);
  });
});
