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
