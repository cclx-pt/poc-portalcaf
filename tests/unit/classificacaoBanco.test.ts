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
  it('reembolso: o código cruza mesmo com espaços, hífen ou minúsculas e com despesas do ano anterior', () => {
    const despesas = [lote('despesas', 'moita', [{ id: 's9', data: '2025-12-20', valor: 25.5, extra: { codigo: 'r2026-0031' } }])];
    const [a, b] = proporClassificacao([mov('1', '2026-01-08', -25.5, 'TRF CCLX R 20260031'), mov('2', '2026-01-09', -25.5, 'REEMB R2026-0031')], ctx({ despesas }));
    expect(a).toMatchObject({ estado: 'proposto', conciliadoCom: 'despesas:s9', comunidadeId: 'moita' });
    expect(b.nota).toMatch(/R20260031/);
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
  it('"TFI", "Trf. MB WAY" e "Trf.Imed" de entrada: sempre oferta/dízimo na comunidade Geral, antes de regras, memória e depósitos', () => {
    const regras = [{ id: 'x', padrao: 'JOAO', categoria: '02.01 Rendas e condomínios', ativo: true }];
    const historico = [{ ...mov('h', '2026-02-05', 20, 'TFI JOAO SILVA'), estado: 'validado' as const, categoria: 'R2.01 Eventos e inscrições', comunidadeId: 'almada' }];
    const depositos = [lote('depositos', 'moita', [{ id: 'd1', data: '2026-03-04', valor: 20 }])];
    const r = proporClassificacao([mov('1', '2026-03-05', 20, 'TFI JOAO SILVA'), mov('2', '2026-03-05', 15, 'Trf. MB WAY de Joao'), mov('4', '2026-03-05', 30, 'Trf.Imed Maria Santos')], ctx({ regras, historico, depositos }));
    for (const m of r) expect(m).toMatchObject({ estado: 'proposto', categoria: 'R1.02 Ofertas gerais', comunidadeId: 'bolsa-geral' });
    const [saida] = proporClassificacao([mov('3', '2026-03-05', -15, 'Trf. MB WAY para Ana')], ctx());
    expect(saida.comunidadeId).not.toBe('bolsa-geral');
  });
  it('transferência recebida com "dízimo" no descritivo vai para R1.01 Dízimos; sem indicação fica em R1.02 Ofertas gerais', () => {
    const r = proporClassificacao([mov('1', '2026-03-05', 100, 'TFI JOAO SILVA DIZIMO MARCO'), mov('2', '2026-03-05', 50, 'Trf. MB WAY Dízimos'), mov('3', '2026-03-05', 20, 'TFI ANA OFERTA'), mov('4', '2026-03-05', 10, 'TRF SEPA PEDRO DIZIMO'), mov('5', '2026-03-05', 5, 'TFI RUI')], ctx());
    expect(r.map((m) => [m.categoria, m.comunidadeId])).toEqual([
      ['R1.01 Dízimos', 'bolsa-geral'], ['R1.01 Dízimos', 'bolsa-geral'], ['R1.02 Ofertas gerais', 'bolsa-geral'], ['R1.01 Dízimos', 'bolsa-geral'], ['R1.02 Ofertas gerais', 'bolsa-geral'],
    ]);
  });
  it('vencimento igual ao previsto nos custos fixos: comunidade do custo; repartido se partilhado', () => {
    const cf = (id: string, com: string, inc: number): CustoFixo => ({ id, comunidadeId: com, rubrica: 'Vencimento Pastoral', categoria: '01.01 Remunerações e subsídios', valorMensal: 1500, incidencia: inc, ano: 2026, inicio: '2026-01', fim: '2026-12', nivel: 'confidencial' });
    const [m] = proporClassificacao([mov('1', '2026-03-28', -1500, 'TRF ORDENADO MARCO')], ctx({ custosFixos: [cf('a', 'moita', 50), cf('b', 'sede', 50)] }));
    expect(m).toMatchObject({ estado: 'proposto', categoria: '01.01 Remunerações e subsídios', centroCusto: 'CC03' });
    expect(m.partes).toEqual([{ comunidadeId: 'moita', valor: -750 }, { comunidadeId: 'sede', valor: -750 }]);
  });
  it('vencimentos: compara com o valor mensal total de cada custo (não com o imputado) e não mistura pastores diferentes', () => {
    const cf = (id: string, com: string, v: number, inc = 100): CustoFixo => ({ id, comunidadeId: com, rubrica: 'Vencimento Pastoral', categoria: '01.01 Remunerações e subsídios', valorMensal: v, incidencia: inc, ano: 2026, inicio: '2026-01', fim: '2026-12', nivel: 'confidencial' });
    const custosFixos = [cf('ac', 'acores', 1200), cf('ca', 'caldas', 750), cf('co', 'coruche', 750), cf('mo', 'moita', 1500, 50), cf('se', 'sede', 1500, 50), cf('s2', 'sede', 800)];
    const [a, b, c] = proporClassificacao([mov('1', '2026-03-28', -1500, 'TRF ORDENADO'), mov('2', '2026-03-28', -1500, 'TRF P/ ENOQUE'), mov('3', '2026-03-28', -800, 'TRF VENCIMENTO')], ctx({ custosFixos }));
    for (const m of [a, b]) {
      expect(m).toMatchObject({ estado: 'proposto', categoria: '01.01 Remunerações e subsídios', centroCusto: 'CC03' });
      expect(m.partes).toEqual([{ comunidadeId: 'moita', valor: -750 }, { comunidadeId: 'sede', valor: -750 }]);
    }
    expect(c).toMatchObject({ estado: 'proposto', comunidadeId: 'sede' });
    expect(c.partes).toBeUndefined();
  });
  it('vencimento com o mesmo valor em duas comunidades: usa a memória; sem ela fica para rever com as opções', () => {
    const cf = (id: string, com: string): CustoFixo => ({ id, comunidadeId: com, rubrica: 'Vencimento Pastoral', categoria: '01.01 Remunerações e subsídios', valorMensal: 750, ano: 2026, inicio: '2026-01', fim: '2026-12', nivel: 'confidencial' });
    const custosFixos = [cf('ca', 'caldas'), cf('co', 'coruche')];
    const [r] = proporClassificacao([mov('1', '2026-03-28', -750, 'TRF ORDENADO XPTO')], ctx({ custosFixos }));
    expect(r.estado).toBe('rever');
    expect(r.nota).toMatch(/caldas.*coruche|coruche.*caldas/);
    const historico = [{ ...mov('h', '2026-02-27', -750, 'TRF ORDENADO XPTO'), estado: 'validado' as const, categoria: '01.01 Remunerações e subsídios', comunidadeId: 'coruche' }];
    const [m] = proporClassificacao([mov('2', '2026-03-28', -750, 'TRF ORDENADO XPTO')], ctx({ custosFixos, historico }));
    expect(m).toMatchObject({ estado: 'proposto', comunidadeId: 'coruche' });
    const [semPalavra] = proporClassificacao([mov('3', '2026-03-28', -750, 'COMPRA LOJA')], ctx({ custosFixos }));
    expect(semPalavra.categoria).not.toBe('01.01 Remunerações e subsídios');
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

describe('itemização: um movimento dividido em várias linhas', () => {
  const base = (): MovBanco => ({ id: 'i1', data: '2026-03-10', descricao: 'COMPRA CONTINENTE', valor: -100, saldo: null, estado: 'proposto',
    categoria: '06.01 Material de consumo', partes: [
      { comunidadeId: 'almada', valor: -60, categoria: '06.01 Material de consumo', descricao: 'Limpeza' },
      { comunidadeId: 'moita', valor: -30, categoria: '04.02 Alimentação e catering', descricao: 'Lanche GC' },
      { comunidadeId: 'moita', valor: -10, categoria: 'F2.01 Adiantamentos' },
    ] } as unknown as MovBanco);
  it('validar marca cada linha (financeiras não contam) e o movimento conta se alguma linha contar', async () => {
    const { validar, pedacosDe } = await import('../../src/lib/classificacaoBanco');
    const cs = [...cats, { id: 'f', nome: 'F2.01 Adiantamentos', codigo: 'F2.01', tipo: 'financeiro' }] as typeof cats;
    const v = validar(base(), cs);
    expect(v.contabilizar).toBe(true);
    expect(v.partes!.map((p) => p.contabilizar)).toEqual([true, true, false]);
    const ps = pedacosDe(v);
    expect(ps.map((p) => [p.categoria, p.comunidadeId, p.valor, p.contabilizar])).toEqual([
      ['06.01 Material de consumo', 'almada', -60, true], ['04.02 Alimentação e catering', 'moita', -30, true], ['F2.01 Adiantamentos', 'moita', -10, false],
    ]);
  });
  it('linhas sem categoria herdam a do movimento; o controlo do mês separa contabilizado e financeiro', async () => {
    const { validar, pedacosDe, controloMes } = await import('../../src/lib/classificacaoBanco');
    const cs = [...cats, { id: 'f', nome: 'F2.01 Adiantamentos', codigo: 'F2.01', tipo: 'financeiro' }] as typeof cats;
    const m = base(); m.partes![0].categoria = undefined;
    const v = validar(m, cs);
    expect(pedacosDe(v)[0].categoria).toBe('06.01 Material de consumo');
    expect(controloMes([v])).toMatchObject({ total: 100, contabilizado: 90, financeiro: 10, fechado: true });
  });
  it('o relatório conta cada linha na sua categoria', async () => {
    const { validar, relatorioExtratos } = await import('../../src/lib/classificacaoBanco');
    const cs = [...cats, { id: 'f', nome: 'F2.01 Adiantamentos', codigo: 'F2.01', tipo: 'financeiro' }] as typeof cats;
    const r = relatorioExtratos([validar(base(), cs)], cs, 'categoria', 1, 12);
    expect(r.linhas.map((l) => [l.chave, l.despesas])).toEqual([['04.02 Alimentação e catering', 30], ['06.01 Material de consumo', 60]]);
  });
});

describe('guardar regra a partir de um movimento', () => {
  it('sugere o texto da regra sem prefixos do banco, números nem datas', async () => {
    const { sugerirPadrao, temPalavra } = await import('../../src/lib/classificacaoBanco');
    expect(sugerirPadrao('COMPRA 1234 GARAGEM ALMADA 03/03')).toBe('GARAGEM ALMADA');
    expect(sugerirPadrao('DD PT12345 EDP COMERCIAL')).toBe('EDP COMERCIAL');
    expect(sugerirPadrao('PAG SERV 10297 HOSTINGER INTERNATIONAL LTD CYPRUS')).toBe('HOSTINGER INTERNATIONAL LTD');
    expect(temPalavra('COMPRA 9876 GARAGEM ALMADA 04/04', 'GARAGEM ALMADA')).toBe(true);
  });
});

describe('filtro por descrição', () => {
  it('ignora maiúsculas e acentos e exige todas as palavras', async () => {
    const { descricaoContem } = await import('../../src/lib/classificacaoBanco');
    expect(descricaoContem('TRF MB WAY DE JOÃO SILVA', 'joao')).toBe(true);
    expect(descricaoContem('TRF MB WAY DE JOÃO SILVA', 'mb way silva')).toBe(true);
    expect(descricaoContem('TRF MB WAY DE JOÃO SILVA', 'silva costa')).toBe(false);
    expect(descricaoContem('QUALQUER', '  ')).toBe(true);
  });
});
