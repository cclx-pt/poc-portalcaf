import { describe, expect, it } from 'vitest';
import { POR_TRADUZIR, propostaTraducao, traduzirLotes, tradutorJotform, valoresJotform, type TraducaoJotform } from '../../src/lib/traducaoJotform';
import { categoriasDoPlano } from '../../src/lib/plano';
import type { Lote } from '../../src/lib/types';

const cats = categoriasDoPlano();
const lote = (origem: Lote['origem'], regs: { id: string; categoria: string; valor: number }[]): Lote =>
  ({ id: `${origem}_1`, origem, ano: 2026, mes: 3, periodo: '2026-03', comunidadeId: 'almada', total: 0, n: regs.length, atualizadoEm: '', atualizadoPor: '', registos: regs.map((r) => ({ ...r, data: '2026-03-01' })) }) as Lote;

describe('tradução das categorias do Jotform para as categorias CAF', () => {
  const tabela: TraducaoJotform = { linhas: [{ origem: 'contribuir', valor: 'Dizimo', codigo: 'R1.01' }, { origem: 'despesas', valor: 'Missões', codigo: '07.01' }] };
  const tr = tradutorJotform(tabela, cats);
  it('a tabela manda (sem distinguir maiúsculas nem acentos) e cada formulário tem a sua tradução', () => {
    expect(tr('contribuir', 'DÍZIMO')).toMatchObject({ categoria: 'R1.01 Dízimos', fonte: 'tabela' });
    expect(tr('despesas', 'missoes')).toMatchObject({ categoria: '07.01 Apoio missionário', fonte: 'tabela' });
  });
  it('um valor que já é uma categoria CAF fica como está; sem tradução, a proposta automática pelos sinónimos; senão, por traduzir', () => {
    expect(tr('contribuir', 'R1.02 Ofertas gerais')).toMatchObject({ categoria: 'R1.02 Ofertas gerais', fonte: 'caf' });
    expect(tr('contribuir', 'Oferta')).toMatchObject({ categoria: 'R1.02 Ofertas gerais', fonte: 'automatica' });
    expect(tr('contribuir', 'Coisa estranha')).toEqual({ categoria: null, fonte: null });
  });
  it('a categoria do lado errado (gasto num formulário de entradas) não serve na proposta automática', () => {
    expect(tr('contribuir', 'Limpeza').categoria).toBeNull();
    expect(tr('despesas', 'Limpeza')).toMatchObject({ categoria: '02.04 Limpeza e higiene' });
  });
  it('traduz os lotes guardando o valor original; o que falta fica "Por traduzir"', () => {
    const [l] = traduzirLotes([lote('contribuir', [{ id: 'a', categoria: 'Dizimo', valor: 10 }, { id: 'b', categoria: 'Coisa estranha', valor: 5 }])], 'contribuir', tr);
    expect(l.registos[0]).toMatchObject({ categoria: 'R1.01 Dízimos', extra: { categoriaJotform: 'Dizimo' } });
    expect(l.registos[1].categoria).toBe(`${POR_TRADUZIR}: Coisa estranha`);
  });
  it('lista os valores do Jotform por formulário com contagem e total, e propõe a tradução dos que faltam', () => {
    const vals = valoresJotform({ contribuir: [lote('contribuir', [{ id: 'a', categoria: 'Dizimo', valor: 10 }, { id: 'b', categoria: 'dízimo', valor: 5 }, { id: 'c', categoria: 'Oferta', valor: 2 }])] });
    expect(vals).toEqual([{ origem: 'contribuir', valor: 'Dizimo', n: 2, total: 15 }, { origem: 'contribuir', valor: 'Oferta', n: 1, total: 2 }]);
    expect(propostaTraducao(vals, { linhas: [] }, cats)).toEqual([{ origem: 'contribuir', valor: 'Dizimo', codigo: 'R1.01' }, { origem: 'contribuir', valor: 'Oferta', codigo: 'R1.02' }]);
  });
});

describe('resultados só com categorias CAF', () => {
  it('com a tradução, o Contribuir conta nas categorias CAF; o que falta traduzir fica à parte', async () => {
    const { calcularResumos } = await import('../../src/lib/resumos');
    const l = { ...lote('contribuir', [{ id: 'a', categoria: 'Dizimo', valor: 10 }, { id: 'b', categoria: 'Xpto', valor: 5 }]) };
    const base = { ano: 2026, comunidades: [{ id: 'almada', nome: 'Almada', ordem: 1 }], contribuir: [l], depositos: [], despesas: [], assistencia: [], banco: [], custosFixos: [], mesesFechados: new Set<string>(), hoje: '2026-11-26', categorias: cats };
    const [r] = calcularResumos({ ...base, traducaoJotform: { linhas: [{ origem: 'contribuir', valor: 'dízimo', codigo: 'R1.01' }] } } as never);
    expect(r.meses[2].entradasPorCategoria).toEqual({ 'R1.01 Dízimos': 10, [`${POR_TRADUZIR}: Xpto`]: 5 });
    const [sem] = calcularResumos(base as never);
    expect(Object.keys(sem.meses[2].entradasPorCategoria)).toEqual(['Dizimo', 'Xpto']);
  });
});
