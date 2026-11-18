import { describe, expect, it } from 'vitest';
import { anoDoCusto, copiarAno, totaisPorRubrica } from '../../src/lib/custosAno';
import { custoAtivo, custoNoAno } from '../../src/lib/resumos';
import type { Comunidade, CustoFixo } from '../../src/lib/types';

const cf = (p: Partial<CustoFixo>): CustoFixo => ({ id: 'x', comunidadeId: 'almada', rubrica: 'Renda', valorMensal: 100, inicio: '2026-01', fim: '2026-12', nivel: 'privado', ...p });
const com = (id: string, fim?: string): Comunidade => ({ id, nome: id, ...(fim ? { fim } : {}) } as Comunidade);

describe('anoDoCusto', () => {
  it('usa o campo ano e, nas linhas antigas, o ano do início', () => {
    expect(anoDoCusto(cf({ ano: 2025, inicio: '2025-03' }))).toBe(2025);
    expect(anoDoCusto(cf({ inicio: '2027-01', fim: null }))).toBe(2027);
  });
});

describe('linhas com ano contam só nesse ano', () => {
  it('custoAtivo e custoNoAno respeitam o ano', () => {
    const c = cf({ ano: 2026, inicio: '2026-01', fim: '2026-12' });
    expect(custoAtivo(c, '2026-12')).toBe(true);
    expect(custoAtivo(c, '2027-01')).toBe(false);
    expect(custoNoAno(c, 2027)).toBe(false);
    expect(custoNoAno(cf({ ano: 2026, inicio: '2026-01', fim: null }), 2027)).toBe(false);
  });
});

describe('copiarAno', () => {
  const comunidades = [com('almada'), com('barreiro', '2026-10-31'), com('sede')];
  it('copia a linha mais recente de cada rubrica para jan-dez do destino, com atualização %', () => {
    const custos = [
      cf({ id: 'a1', ano: 2026, inicio: '2026-01', fim: '2026-06', valorMensal: 500 }),
      cf({ id: 'a2', ano: 2026, inicio: '2026-07', fim: '2026-12', valorMensal: 520, incidencia: 50, ambito: 'geral', nivel: 'confidencial', notas: 'n' }),
      cf({ id: 's1', comunidadeId: 'sede', rubrica: 'Luz', ano: 2026, valorMensal: 33.33 }),
      cf({ id: 'v', ano: 2025, inicio: '2025-01', fim: '2025-12', rubrica: 'Água' }),
    ];
    const r = copiarAno(custos, { origem: 2026, destino: 2028, atualizacao: 3, comunidades: null }, comunidades);
    expect(r.novos.map((c) => [c.comunidadeId, c.rubrica, c.ano, c.inicio, c.fim, c.valorMensal, c.incidencia, c.ambito, c.nivel, c.notas])).toEqual([
      ['almada', 'Renda', 2028, '2028-01', '2028-12', 535.6, 50, 'geral', 'confidencial', 'n'],
      ['sede', 'Luz', 2028, '2028-01', '2028-12', 34.33, undefined, undefined, 'privado', undefined],
    ]);
    expect(new Set(r.novos.map((c) => c.id)).size).toBe(2);
    expect(r.novos.every((c) => c.id.endsWith('-2028'))).toBe(true);
  });
  it('não copia linhas que terminaram antes de dezembro nem comunidades inativas no destino; filtra comunidades', () => {
    const custos = [
      cf({ id: 'b', comunidadeId: 'barreiro', ano: 2026, inicio: '2026-01', fim: '2026-10' }),
      cf({ id: 'c', rubrica: 'Contrato antigo', ano: 2026, inicio: '2026-01', fim: '2026-05' }),
      cf({ id: 'd', ano: 2026 }),
      cf({ id: 'e', comunidadeId: 'sede', ano: 2026 }),
    ];
    const r = copiarAno(custos, { origem: 2026, destino: 2027, atualizacao: 0, comunidades: ['almada', 'barreiro'] }, comunidades);
    expect(r.novos.map((c) => [c.comunidadeId, c.rubrica])).toEqual([['almada', 'Renda']]);
    expect(r.avisos).toHaveLength(2);
    expect(r.avisos.join(' ')).toMatch(/barreiro/i);
    expect(r.avisos.join(' ')).toMatch(/Contrato antigo/);
  });
  it('recusa origem igual ao destino', () => {
    expect(() => copiarAno([], { origem: 2026, destino: 2026, atualizacao: 0, comunidades: null }, comunidades)).toThrow();
  });
});

describe('totaisPorRubrica (gráfico)', () => {
  it('soma por rubrica, ordena do maior para o menor e junta o resto em "Outros"', () => {
    const v = new Map([['a', 10], ['b', 30], ['c', 5], ['d', 1], ['e', 2]]);
    const linhas = [cf({ id: 'a', rubrica: 'Renda' }), cf({ id: 'b', rubrica: 'Luz' }), cf({ id: 'c', rubrica: 'Renda' }), cf({ id: 'd', rubrica: 'Água' }), cf({ id: 'e', rubrica: 'Gás' })];
    expect(totaisPorRubrica(linhas, (c) => v.get(c.id)!, 2)).toEqual([
      { rubrica: 'Luz', valor: 30 }, { rubrica: 'Renda', valor: 15 }, { rubrica: 'Outros (2 rubricas)', valor: 3 },
    ]);
    expect(totaisPorRubrica(linhas, () => 0, 2)).toEqual([]);
  });
});
