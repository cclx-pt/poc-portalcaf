import { describe, expect, it } from 'vitest';
import { sugerirRegras } from '../../src/lib/sugestaoRegras';
import { proporClassificacao, type RegraBanco } from '../../src/lib/classificacaoBanco';
import { categoriasDoPlano } from '../../src/lib/plano';
import type { MovBanco } from '../../src/lib/types';

const cats = categoriasDoPlano();
const v = (id: string, data: string, valor: number, descricao: string, x: Partial<MovBanco> = {}): MovBanco =>
  ({ id, data, valor, descricao, contabilizar: true, estado: 'validado', categoria: '02.03 Comunicações', comunidadeId: 'almada', centroCusto: 'CC02', ...x });
const meo = (mes: string, x: Partial<MovBanco> = {}) => v(`meo-${mes}`, `2026-${mes}-05`, -45.9, `DD MEO SA ${mes}0099`, { fornecedor: 'MEO', ...x });

describe('regras sugeridas a partir do histórico consolidado', () => {
  it('movimento validado que se repete em 3 meses ou mais, sempre com a mesma classificação, sugere uma regra', () => {
    const [s, ...resto] = sugerirRegras([meo('01'), meo('02'), meo('03')], [], { categorias: cats });
    expect(resto).toEqual([]);
    expect(s).toMatchObject({ padrao: 'MEO SA', categoria: '02.03 Comunicações', comunidadeId: 'almada', centroCusto: 'CC02', fornecedor: 'MEO', ocorrencias: 3, meses: ['2026-01', '2026-02', '2026-03'], mensal: true, acao: 'nova' });
    expect(s.valorMedio).toBe(-45.9);
  });
  it('menos de 3 meses, ou classificação que muda (menos de 80% iguais), não sugere', () => {
    expect(sugerirRegras([meo('01'), meo('02')], [], { categorias: cats })).toEqual([]);
    const mistos = [meo('01'), meo('02'), meo('03', { comunidadeId: 'porto' }), meo('04', { comunidadeId: 'porto' })];
    expect(sugerirRegras(mistos, [], { categorias: cats })).toEqual([]);
  });
  it('ignora o que não está validado, o conciliado com o Jotform e o dividido em linhas', () => {
    const movs = [meo('01', { estado: 'proposto' }), meo('02', { conciliadoCom: 'despesas:x' }), meo('03', { partes: [{ comunidadeId: 'almada', valor: -45.9 }] }), meo('04')];
    expect(sugerirRegras(movs, [], { categorias: cats })).toEqual([]);
  });
  it('não repete uma regra que já classifica igual; propõe atualizar a que tem o mesmo texto e classifica diferente', () => {
    const igual: RegraBanco = { id: 'r', padrao: 'MEO', categoria: '02.03 Comunicações', comunidadeId: 'almada', centroCusto: 'CC02', ativo: true };
    expect(sugerirRegras([meo('01'), meo('02'), meo('03')], [igual], { categorias: cats })).toEqual([]);
    const outra: RegraBanco = { id: 'meo-sa', padrao: 'MEO SA', categoria: '02.03 Comunicações', comunidadeId: 'sede', ativo: true };
    expect(sugerirRegras([meo('01'), meo('02'), meo('03')], [outra], { categorias: cats })[0]).toMatchObject({ id: 'meo-sa', acao: 'atualizar', comunidadeId: 'almada' });
  });
  it('meses não seguidos: sugere, mas não marca como mensal', () => {
    const s = sugerirRegras([meo('01'), meo('04'), meo('09')], [], { categorias: cats })[0];
    expect(s).toMatchObject({ ocorrencias: 3, mensal: false });
  });
  it('a regra guardada é usada na proposta de classificação de um extrato novo (centro de custo e fornecedor incluídos)', () => {
    const [s] = sugerirRegras([meo('01'), meo('02'), meo('03')], [], { categorias: cats });
    const regra: RegraBanco = { id: s.id, padrao: s.padrao, categoria: s.categoria, comunidadeId: s.comunidadeId, centroCusto: s.centroCusto, fornecedor: s.fornecedor, ativo: true };
    const [m] = proporClassificacao([{ id: 'n', data: '2026-11-05', valor: -45.9, descricao: 'DD MEO SA 110099', contabilizar: false }], { categorias: cats, regras: [regra], depositos: [], despesas: [], historico: [], custosFixos: [] });
    expect(m).toMatchObject({ estado: 'proposto', categoria: '02.03 Comunicações', comunidadeId: 'almada', centroCusto: 'CC02', fornecedor: 'MEO' });
  });
});

describe('regra com projeto e conta analítica', () => {
  it('a proposta leva o projeto e a conta analítica da regra', () => {
    const regra: RegraBanco = { id: 'h', padrao: 'HOTEL GOLF', categoria: '06.01 Alojamento e espaços', comunidadeId: 'sede', centroCusto: 'CC06', projeto: 'Retiro B1 2026', contaAnalitica: 'Estadias', ativo: true };
    const [m] = proporClassificacao([{ id: 'n', data: '2026-05-05', valor: -4550, descricao: 'HOTEL GOLF MAR 6787', contabilizar: false }], { categorias: cats, regras: [regra], depositos: [], despesas: [], historico: [], custosFixos: [] });
    expect(m).toMatchObject({ categoria: '06.01 Alojamento e espaços', projeto: 'Retiro B1 2026', contaAnalitica: 'Estadias', centroCusto: 'CC06' });
  });
});

describe('texto da regra', () => {
  it('sem títulos nem prefixos; texto curto demais não serve', async () => {
    const { padraoDe } = await import('../../src/lib/sugestaoRegras');
    expect(padraoDe('TRF MB WAY DE DRA')).toBeNull();
    expect(padraoDe('TRF MBWAY RENDA CCLX ALMADA')).toBe('RENDA CCLX ALMADA');
    expect(padraoDe('DD MEO SA 110099')).toBe('MEO SA');
    expect(padraoDe('ZOOM')).toBeNull();
  });
  it('não sugere duas regras quando uma contém a outra com a mesma classificação', () => {
    const a = (mes: string, d: string) => v(`${d}-${mes}`, `2026-${mes}-03`, 20, d, { categoria: 'R1.02 Ofertas gerais', comunidadeId: 'sede' });
    const movs = ['01', '02', '03'].flatMap((m) => [a(m, 'TRF MBWAY FULANO BELTRANO'), a(m, 'FULANO BELTRANO')]);
    expect(sugerirRegras(movs, [], { categorias: cats }).map((s) => s.padrao)).toEqual(['FULANO BELTRANO']);
  });
});
