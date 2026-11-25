import { describe, expect, it } from 'vitest';
import { podeValidar } from '../../src/lib/classificacaoBanco';
const m = (x: object) => ({ id: 'a', data: '2026-11-03', descricao: 'EDP', valor: -30, contabilizar: false, ...x });

describe('Validar um movimento proposto (TES-02)', () => {
  it('só quando está proposto e tem categoria e comunidade (ou está repartido ou conciliado)', () => {
    expect(podeValidar(m({ estado: 'proposto', categoria: 'Eletricidade', comunidadeId: 'almada' }))).toBe(true);
    expect(podeValidar(m({ estado: 'proposto', categoria: 'Eletricidade' }))).toBe(false);
    expect(podeValidar(m({ estado: 'proposto', comunidadeId: 'almada' }))).toBe(false);
    expect(podeValidar(m({ estado: 'rever', categoria: 'Eletricidade', comunidadeId: 'almada' }))).toBe(false);
    expect(podeValidar(m({ estado: 'proposto', categoria: 'Reembolsos', conciliadoCom: 'despesas:x' }))).toBe(true);
    expect(podeValidar(m({ estado: 'proposto', categoria: 'Eletricidade', partes: [{ valor: -30, comunidadeId: 'almada' }] }))).toBe(true);
  });
});
