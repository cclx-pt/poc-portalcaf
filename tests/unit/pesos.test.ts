import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/firebase', () => ({ db: {} }));
import { fecharEm100, pesosValidos, somaPesos } from '../../src/lib/pesos';

describe('pesos gravados', () => {
  it('têm de somar 100% (tolerância de arredondamento) e nenhum pode ser negativo', () => {
    expect(pesosValidos({ a: 33, b: 33, c: 34 })).toBe(true);
    expect(pesosValidos({ a: 50, b: 49 })).toBe(false);
    expect(pesosValidos({ a: 110, b: -10 })).toBe(false);
  });
  it('fecha a soma em 100 com percentagens inteiras (maiores restos)', () => {
    expect(fecharEm100({ a: 33.33, b: 33.33, c: 33.33 })).toEqual({ a: 34, b: 33, c: 33 });
    expect(fecharEm100({ a: 66.67, b: 33.33 })).toEqual({ a: 67, b: 33 });
    // empate nos restos: primeiro o maior peso
    expect(fecharEm100({ a: 12.5, b: 12.5, c: 37.5, d: 37.5 })).toEqual({ a: 12, b: 12, c: 38, d: 38 });
    expect(fecharEm100({ a: 0, b: 0 })).toEqual({ a: 0, b: 0 });
  });
  it('pesos com decimais não são válidos: têm de ser inteiros', () => {
    expect(pesosValidos({ a: 40, b: 60 })).toBe(true);
    expect(pesosValidos({ a: 40.5, b: 59.5 })).toBe(false);
  });
});

describe('tabela dos pesos gravados: pessoas ou %, sem decimais', () => {
  const g = { metodo: 'mediana', pesos: { almada: 40.37, porto: 59.63 }, proposta: { media: { almada: { valor: 11.2, pct: 38 } }, mediana: { almada: { valor: 12.6, pct: 40.37 }, porto: { valor: 18.4, pct: 59.63 } } } } as never;
  it('% arredondada à unidade', async () => {
    const { textoPeso } = await import('../../src/lib/pesos');
    expect(textoPeso(g, 'almada', 'pct')).toBe('40%');
    expect(textoPeso(g, 'porto', 'pct')).toBe('60%');
  });
  it('pessoas: jovens e adultos por celebração pelo método do mês, sem decimais', async () => {
    const { textoPeso } = await import('../../src/lib/pesos');
    expect(textoPeso(g, 'almada', 'pessoas')).toBe('13');
    expect(textoPeso(g, 'lisboa', 'pessoas')).toBeNull();
    expect(textoPeso(undefined, 'almada', 'pct')).toBeNull();
  });
});

describe('tabela anual pela média ou pela mediana (sempre calculadas)', () => {
  it('mostra a % ou as pessoas da proposta do método, sem decimais', async () => {
    const { textoProposta } = await import('../../src/lib/pesos');
    const prop = { media: { a: { valor: 12.6, pct: 40.37 } }, mediana: { a: { valor: 11.2, pct: 38.5 } } };
    expect(textoProposta(prop, 'media', 'a', 'pct')).toBe('40%');
    expect(textoProposta(prop, 'mediana', 'a', 'pct')).toBe('39%');
    expect(textoProposta(prop, 'mediana', 'a', 'pessoas')).toBe('11');
    expect(textoProposta(prop, 'media', 'b', 'pct')).toBeNull();
    expect(textoProposta(null, 'media', 'a', 'pct')).toBeNull();
  });
});

import { folhaPesosGravados } from '../../src/lib/pesos';
describe('Excel dos pesos gravados por mês (ADM-05)', () => {
  const coms = [{ id: 'almada', nome: 'Almada' }, { id: 'porto', nome: 'Porto' }];
  const g = (mes: number, pesos: Record<string, number>, manual = false) => ({ id: `2026-0${mes}`, ano: 2026, mes, metodo: 'mediana', pesos, manual,
    proposta: { media: {}, mediana: { almada: { valor: 12.6, pct: 40 }, porto: { valor: 18.44, pct: 60 } } }, calculadoEm: '', gravadoPor: '', gravadoEm: '' }) as never;
  it('uma linha por comunidade e uma coluna por mês, em percentagens inteiras que somam 100', () => {
    const f = folhaPesosGravados([g(1, { almada: 40.37, porto: 59.63 }), g(3, { almada: 33.5, porto: 66.5 }, true)], coms, 'pct');
    expect(f.cabecalho).toEqual(['Comunidade', 'jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']);
    expect(f.linhas[0]).toEqual(['Almada', 40, null, 33, null, null, null, null, null, null, null, null, null]);
    expect(f.linhas[1]).toEqual(['Porto', 60, null, 67, null, null, null, null, null, null, null, null, null]);
    expect(f.total).toEqual(['Total', 100, null, 100, null, null, null, null, null, null, null, null, null]);
    expect(f.metodo).toEqual(['Método', 'Mediana', 'Auto', 'À mão', 'Auto', 'Auto', 'Auto', 'Auto', 'Auto', 'Auto', 'Auto', 'Auto', 'Auto']);
  });
  it('em pessoas mostra os jovens e adultos por celebração do método do mês, sem total', () => {
    const f = folhaPesosGravados([g(1, { almada: 40, porto: 60 })], coms, 'pessoas');
    expect(f.linhas[0][1]).toBe(12.6);
    expect(f.linhas[1][1]).toBe(18.4);
    expect(f.total).toBeNull();
  });
});
