import { describe, expect, it } from 'vitest';
import { faltaCentroCusto, podeValidar } from '../../src/lib/classificacaoBanco';
import type { Categoria } from '../../src/lib/types';
const m = (x: object) => ({ id: 'a', data: '2026-11-03', descricao: 'EDP', valor: -30, contabilizar: false, ...x });
const cats = [
  { id: 'e', codigo: '02.02', nome: 'Eletricidade', tipo: 'saida' },
  { id: 't', codigo: 'F2.01', nome: 'Transferências internas', tipo: 'financeiro' },
] as Categoria[];

describe('Validar um movimento proposto (TES-02)', () => {
  it('só quando está proposto e tem categoria, comunidade (ou está repartido ou conciliado) e centro de custo', () => {
    expect(podeValidar(m({ estado: 'proposto', categoria: 'Eletricidade', comunidadeId: 'almada', centroCusto: 'CC01' }), cats)).toBe(true);
    expect(podeValidar(m({ estado: 'proposto', categoria: 'Eletricidade', centroCusto: 'CC01' }), cats)).toBe(false);
    expect(podeValidar(m({ estado: 'proposto', comunidadeId: 'almada', centroCusto: 'CC01' }), cats)).toBe(false);
    expect(podeValidar(m({ estado: 'rever', categoria: 'Eletricidade', comunidadeId: 'almada', centroCusto: 'CC01' }), cats)).toBe(false);
    expect(podeValidar(m({ estado: 'proposto', categoria: 'Reembolsos', conciliadoCom: 'despesas:x' }), cats)).toBe(true);
    expect(podeValidar(m({ estado: 'proposto', categoria: 'Eletricidade', centroCusto: 'CC01', partes: [{ valor: -30, comunidadeId: 'almada' }] }), cats)).toBe(true);
  });
  it('o centro de custo é obrigatório nos movimentos que contam nos resultados', () => {
    expect(podeValidar(m({ estado: 'proposto', categoria: 'Eletricidade', comunidadeId: 'almada' }), cats)).toBe(false);
    expect(faltaCentroCusto(m({ categoria: 'Eletricidade', comunidadeId: 'almada' }), cats)).toBe(true);
    // financeiros e conciliados com o Jotform não contam nos resultados: não precisam
    expect(faltaCentroCusto(m({ categoria: 'Transferências internas', comunidadeId: 'almada' }), cats)).toBe(false);
    expect(faltaCentroCusto(m({ categoria: 'Eletricidade', conciliadoCom: 'despesas:x' }), cats)).toBe(false);
  });
  it('movimento dividido: cada linha que conta precisa de centro de custo (o seu ou o do movimento)', () => {
    const partes = [{ valor: -20, comunidadeId: 'almada', centroCusto: 'CC02' }, { valor: -10, comunidadeId: 'moita' }];
    expect(faltaCentroCusto(m({ categoria: 'Eletricidade', partes }), cats)).toBe(true);
    expect(faltaCentroCusto(m({ categoria: 'Eletricidade', centroCusto: 'CC01', partes }), cats)).toBe(false);
    expect(faltaCentroCusto(m({ categoria: 'Eletricidade', partes: [partes[0], { ...partes[1], categoria: 'Transferências internas' }] }), cats)).toBe(false);
  });
});
