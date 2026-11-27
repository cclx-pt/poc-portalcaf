import { describe, expect, it } from 'vitest';
import { distribuir, montanteDePct, pctDeMontante, pesosMediaAnual, resumoManual } from '../../src/lib/calculadora';

describe('Ferramentas › Calculadora de distribuição', () => {
  it('distribui o montante pelos pesos, em cêntimos, e a soma bate certo com o total', () => {
    expect(distribuir(1000, { almada: 13, acores: 10, moita: 23, porto: 16, coruche: 6, sede: 27, cdr: 5, barreiro: 0 }))
      .toEqual({ almada: 130, acores: 100, moita: 230, porto: 160, coruche: 60, sede: 270, cdr: 50, barreiro: 0 });
    const d = distribuir(100, { a: 33, b: 33, c: 34 });
    expect(d).toEqual({ a: 33, b: 33, c: 34 });
    const e = distribuir(10, { a: 33, b: 33, c: 34 });
    expect(e).toEqual({ a: 3.3, b: 3.3, c: 3.4 });
    const f = distribuir(0.1, { a: 50, b: 50 });
    expect(Math.round((f.a + f.b) * 100)).toBe(10);
  });
  it('sem montante ou sem pesos fica tudo a zero', () => {
    expect(distribuir(0, { a: 50, b: 50 })).toEqual({ a: 0, b: 0 });
    expect(distribuir(100, { a: 0, b: 0 })).toEqual({ a: 0, b: 0 });
  });
  it('liga % e montante na distribuição manual (% sempre inteiras)', () => {
    expect(montanteDePct(1000, 15)).toBe(150);
    expect(montanteDePct(333, 33)).toBe(109.89);
    expect(pctDeMontante(1000, 150)).toBe(15);
    expect(pctDeMontante(1000, 125)).toBe(13);
    expect(pctDeMontante(0, 125)).toBe(0);
  });
  it('resume a distribuição manual: soma, % e por distribuir', () => {
    const r = resumoManual(1000, { a: 150, b: 100, c: 750 }, { a: 15, b: 10, c: 75 });
    expect(r).toEqual({ montante: 1000, pct: 100, porDistribuir: 0 });
    expect(resumoManual(1000, { a: 150, b: 100 }, { a: 15, b: 10 })).toEqual({ montante: 250, pct: 25, porDistribuir: 750 });
  });
  it('média anual: média dos pesos gravados nos meses com pesos, fechada em inteiros que somam 100', () => {
    expect(pesosMediaAnual([{ almada: 40, porto: 60 }, { almada: 45, porto: 55 }])).toEqual({ almada: 43, porto: 57 });
    expect(pesosMediaAnual([{ almada: 50, porto: 50 }, { almada: 100 }])).toEqual({ almada: 75, porto: 25 });
    expect(pesosMediaAnual([])).toEqual({});
  });
});
