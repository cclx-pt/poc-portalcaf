import { describe, expect, it } from 'vitest';
import { categoriasDoPlano, novaCategoria, proximoCodigo, rubricasDoTipo } from '../../src/lib/plano';

describe('nova categoria: tipo, rubrica, código seguinte e nome', () => {
  const cats = categoriasDoPlano();
  it('as rubricas mostradas dependem do tipo', () => {
    expect(rubricasDoTipo('saida').map((r) => r.codigo)).toEqual(['01', '02', '03', '04', '05', '06', '07', '08', '09']);
    expect(rubricasDoTipo('entrada').map((r) => r.codigo)).toEqual(['R1', 'R2', 'R3']);
    expect(rubricasDoTipo('financeiro').map((r) => r.codigo)).toEqual(['F1', 'F2', 'F3']);
  });
  it('o código é o seguinte ao maior já usado na rubrica (contando as inativas)', () => {
    const max02 = Math.max(...cats.filter((c) => c.codigo!.startsWith('02.')).map((c) => Number(c.codigo!.slice(3))));
    expect(proximoCodigo('02', cats)).toBe(`02.${String(max02 + 1).padStart(2, '0')}`);
    expect(proximoCodigo('02', [...cats, { ...cats[0], id: 'x', codigo: '02.15', ativo: false }])).toBe('02.16');
    expect(proximoCodigo('R1', [])).toBe('R1.01');
    expect(proximoCodigo('R1', [{ ...cats[0], codigo: 'R1.09' }])).toBe('R1.10');
  });
  it('a nova categoria leva o código no nome, o tipo e a rubrica do plano', () => {
    expect(novaCategoria('02', '  Equipamento   de som ', [])).toMatchObject({
      id: 'plano-02-01', codigo: '02.01', nome: '02.01 Equipamento de som', tipo: 'saida', rubrica: '02 Instalações', atividade: 'Instalações', origem: 'portal', ativo: true,
    });
    expect(novaCategoria('F1', 'Câmbios', []).tipo).toBe('financeiro');
  });
});
