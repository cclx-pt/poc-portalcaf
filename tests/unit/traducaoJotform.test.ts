import { describe, expect, it } from 'vitest';
import { opcoesRegra, POR_TRADUZIR, sugestaoRegra, traduzirLotes, tradutorJotform, valoresJotform, type TraducaoJotform } from '../../src/lib/traducaoJotform';
import { categoriasDoPlano } from '../../src/lib/plano';
import type { Lote } from '../../src/lib/types';

const cats = categoriasDoPlano();
const lote = (origem: Lote['origem'], regs: { id: string; categoria: string; valor: number }[]): Lote =>
  ({ id: `${origem}_1`, origem, ano: 2026, mes: 3, periodo: '2026-03', comunidadeId: 'almada', total: 0, n: regs.length, atualizadoEm: '', atualizadoPor: '', registos: regs.map((r) => ({ ...r, data: '2026-03-01' })) }) as Lote;

describe('regras diretas: se aparece A no Jotform, a categoria CAF é B', () => {
  const tabela: TraducaoJotform = { linhas: [
    { origem: 'contribuir', valor: 'Dizimo', codigo: 'R1.01' },
    { origem: 'despesas', valor: 'Missões', codigo: '07.01' },
    { origem: 'contribuir', valor: 'Oferta', codigo: 'R1.02', modo: 'contem' },
    { origem: 'contribuir', valor: 'Oferta Missionária', codigo: 'R1.03', modo: 'contem' },
  ] };
  const tr = tradutorJotform(tabela, cats);
  it('regra "igual": sem distinguir maiúsculas nem acentos, e cada formulário tem as suas regras', () => {
    expect(tr('contribuir', 'DÍZIMO')).toMatchObject({ categoria: 'R1.01 Dízimos', fonte: 'regra' });
    expect(tr('despesas', 'missoes')).toMatchObject({ categoria: '07.01 Apoio missionário', fonte: 'regra' });
    expect(tr('contribuir', 'Missões').categoria).toBeNull();
    expect(tr('contribuir', 'Dízimo Sede Manhã').categoria).toBeNull();
  });
  it('regra "contém": como LIKE %texto% (dentro de qualquer palavra); ganha a mais longa', () => {
    expect(tr('contribuir', 'Oferta Sede Manhã')).toMatchObject({ categoria: 'R1.02 Ofertas gerais' });
    expect(tr('contribuir', 'Oferta Missionária Sede')).toMatchObject({ categoria: 'R1.03 Ofertas consignadas' });
    expect(tr('contribuir', 'Ofertas')).toMatchObject({ categoria: 'R1.02 Ofertas gerais' });
  });
  it('só regras escritas: sem regra fica por traduzir (a sugestão pelos sinónimos não se aplica sozinha)', () => {
    expect(tr('contribuir', 'Dízimos')).toEqual({ categoria: null, fonte: null });
    expect(sugestaoRegra('contribuir', 'Dízimos', cats)?.nome).toBe('R1.01 Dízimos');
    expect(sugestaoRegra('contribuir', 'Limpeza', cats)).toBeNull();
    expect(sugestaoRegra('despesas', 'Limpeza', cats)?.nome).toBe('02.04 Limpeza e higiene');
  });
  it('um valor que já é uma categoria CAF fica como está', () => {
    expect(tr('contribuir', 'R1.02 Ofertas gerais')).toMatchObject({ categoria: 'R1.02 Ofertas gerais', fonte: 'caf' });
  });
  it('traduz os lotes guardando o valor original; o que falta fica "Por traduzir"', () => {
    const [l] = traduzirLotes([lote('contribuir', [{ id: 'a', categoria: 'Dizimo', valor: 10 }, { id: 'b', categoria: 'Coisa estranha', valor: 5 }])], 'contribuir', tr);
    expect(l.registos[0]).toMatchObject({ categoria: 'R1.01 Dízimos', extra: { categoriaJotform: 'Dizimo' } });
    expect(l.registos[1].categoria).toBe(`${POR_TRADUZIR}: Coisa estranha`);
  });
  it('lista os valores do Jotform por formulário com contagem e total', () => {
    const vals = valoresJotform({ contribuir: [lote('contribuir', [{ id: 'a', categoria: 'Dizimo', valor: 10 }, { id: 'b', categoria: 'dízimo', valor: 5 }, { id: 'c', categoria: 'Oferta', valor: 2 }])] });
    expect(vals).toEqual([{ origem: 'contribuir', valor: 'Dizimo', n: 2, total: 15 }, { origem: 'contribuir', valor: 'Oferta', n: 1, total: 2 }]);
  });
});

describe('resultados só com categorias CAF', () => {
  it('com as regras, o Contribuir conta nas categorias CAF; o que falta traduzir fica à parte', async () => {
    const { calcularResumos } = await import('../../src/lib/resumos');
    const l = lote('contribuir', [{ id: 'a', categoria: 'Dizimo', valor: 10 }, { id: 'b', categoria: 'Xpto', valor: 5 }]);
    const base = { ano: 2026, comunidades: [{ id: 'almada', nome: 'Almada', ordem: 1 }], contribuir: [l], depositos: [], despesas: [], assistencia: [], banco: [], custosFixos: [], mesesFechados: new Set<string>(), hoje: '2026-11-26', categorias: cats };
    const [r] = calcularResumos({ ...base, traducaoJotform: { linhas: [{ origem: 'contribuir', valor: 'dízimo', codigo: 'R1.01' }] } } as never);
    expect(r.meses[2].entradasPorCategoria).toEqual({ 'R1.01 Dízimos': 10, [`${POR_TRADUZIR}: Xpto`]: 5 });
    const [sem] = calcularResumos(base as never);
    expect(Object.keys(sem.meses[2].entradasPorCategoria)).toEqual(['Dizimo', 'Xpto']);
  });
});

describe('várias opções numa regra, separadas por ";"', () => {
  const tabela: TraducaoJotform = { linhas: [
    { origem: 'despesas', valor: 'Retiro;Retiros; B1-Retiro2026', codigo: '07.01' },
    { origem: 'contribuir', valor: 'Oferta; Coleta ;', codigo: 'R1.02', modo: 'contem' },
  ] };
  const tr = tradutorJotform(tabela, cats);
  it('"igual": apanha qualquer uma das opções (sem maiúsculas, acentos nem espaços à volta)', () => {
    for (const v of ['Retiro', 'retiros', 'B1-Retiro2026', 'b1 retiro2026']) expect(tr('despesas', v)).toMatchObject({ categoria: '07.01 Apoio missionário', fonte: 'regra', regra: tabela.linhas[0] });
    expect(tr('despesas', 'Retiro Jovens').categoria).toBeNull();
    expect(tr('despesas', 'Retiro;Retiros').categoria).toBeNull();
  });
  it('"contém" apanha o texto no meio de outro, como %Retiro% (B1-Retiro2026, RetiroJovens)', () => {
    const t2 = tradutorJotform({ linhas: [{ origem: 'despesas', valor: 'Retiro', codigo: '07.01', modo: 'contem' }] }, cats);
    for (const v of ['B1-Retiro2026', 'RetiroJovens', 'Despesas do RETIRO', 'Pré-retiro', 'retiro']) expect(t2('despesas', v).categoria).toBe('07.01 Apoio missionário');
    expect(t2('despesas', 'Ret iro').categoria).toBeNull();
  });
  it('"contém": basta uma das opções aparecer; opções vazias são ignoradas', () => {
    expect(tr('contribuir', 'Oferta Sede Manhã')).toMatchObject({ categoria: 'R1.02 Ofertas gerais' });
    expect(tr('contribuir', 'Coleta Almada')).toMatchObject({ categoria: 'R1.02 Ofertas gerais', regra: tabela.linhas[1] });
  });
  it('as opções de uma regra', () => {
    expect(opcoesRegra(' Retiro;Retiros; ;B1-Retiro2026 ')).toEqual(['Retiro', 'Retiros', 'B1-Retiro2026']);
  });
});

describe('categoria com nome mudado', () => {
  it('um valor com o nome antigo de uma categoria CAF passa ao nome atual', () => {
    const cs = cats.map((c) => (c.nome === 'R1.02 Ofertas gerais' ? { ...c, nome: 'R1.02 Ofertas', nomesAnteriores: ['R1.02 Ofertas gerais'] } : c));
    expect(tradutorJotform({ linhas: [] }, cs)('contribuir', 'R1.02 Ofertas gerais')).toMatchObject({ categoria: 'R1.02 Ofertas', fonte: 'caf' });
  });
});
