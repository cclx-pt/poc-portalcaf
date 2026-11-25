import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/firebase', () => ({ db: {} }));
import { fecharEm100, pesosValidos, somaPesos } from '../../src/lib/pesos';

describe('pesos gravados', () => {
  it('têm de somar 100% (tolerância de arredondamento) e nenhum pode ser negativo', () => {
    expect(pesosValidos({ a: 33.33, b: 33.33, c: 33.34 })).toBe(true);
    expect(pesosValidos({ a: 50, b: 49 })).toBe(false);
    expect(pesosValidos({ a: 110, b: -10 })).toBe(false);
  });
  it('fecha a soma em 100 no maior peso', () => {
    const p = fecharEm100({ a: 33.33, b: 33.33, c: 33.33 });
    expect(somaPesos(p)).toBe(100);
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
