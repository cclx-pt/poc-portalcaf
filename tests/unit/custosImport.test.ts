import { describe, expect, it } from 'vitest';
import { importarCustosFixos, limparRubrica } from '../../src/lib/custosImport';
import { COMUNIDADES } from '../../src/lib/seed';

const L = (Site: string, Rubrica: string, inc: unknown, a25: unknown, a26: unknown, a27: unknown) => ({ Site, 'Rúbrica': Rubrica, 'Incidencia %': inc, '2025': a25, '2026': a26, '2027': a27 });

describe('importação de custos fixos (Excel por comunidade)', () => {
  it('limpa as rubricas e tira os nomes das pessoas', () => {
    expect(limparRubrica('Vencimento Pastoral (Carlos)')).toEqual({ rubrica: 'Vencimento Pastoral', confidencial: true });
    expect(limparRubrica('Vencimento Pastoral Imposto mensal segurança social')).toEqual({ rubrica: 'Segurança Social · Vencimento Pastoral', confidencial: true });
    expect(limparRubrica('Vencimendo Elemento - Tesouraria & Admin')).toEqual({ rubrica: 'Vencimento Tesouraria e Administração', confidencial: true });
    expect(limparRubrica('Plafond deslocamento Pr. Vacilius')).toEqual({ rubrica: 'Plafond deslocação pastoral', confidencial: true });
    expect(limparRubrica('Elemento Multimedi Imposto mensal segurança social')).toEqual({ rubrica: 'Segurança Social · Vencimento Multimédia', confidencial: true });
    expect(limparRubrica('Àgua')).toEqual({ rubrica: 'Água', confidencial: false });
    expect(limparRubrica('Luz ')).toEqual({ rubrica: 'Luz', confidencial: false });
    expect(limparRubrica('Imposto mensal renda')).toEqual({ rubrica: 'Imposto sobre a renda', confidencial: false });
  });

  it('um custo por ano com valor: jan-dez, o último ano em vigor; incidência em %', () => {
    const r = importarCustosFixos([L('Moita', 'Vencimento Pastoral (Enoque)', 0.5, 1000, 1500, 1536)], COMUNIDADES);
    expect(r.custos.map((c) => [c.comunidadeId, c.rubrica, c.valorMensal, c.incidencia, c.inicio, c.fim, c.nivel])).toEqual([
      ['moita', 'Vencimento Pastoral', 1000, 50, '2025-01', '2025-12', 'confidencial'],
      ['moita', 'Vencimento Pastoral', 1500, 50, '2026-01', '2026-12', 'confidencial'],
      ['moita', 'Vencimento Pastoral', 1536, 50, '2027-01', null, 'confidencial'],
    ]);
    expect(r.custos[0].notas).toMatch(/partilhado: 50%/i);
    expect(JSON.stringify(r.custos)).not.toContain('Enoque');
  });

  it('valores a zero não criam custo; valores em texto são lidos; incidência 100 por omissão', () => {
    const r = importarCustosFixos([L('Almada', 'Renda ', 1, '1 248,07 €', 2300, 0)], COMUNIDADES);
    expect(r.custos.map((c) => [c.valorMensal, c.inicio, c.fim, c.incidencia])).toEqual([[1248.07, '2025-01', '2025-12', 100], [2300, '2026-01', '2026-12', 100]]);
  });

  it('"Geral" vai para a Sede com âmbito geral (repartido pela assistência)', () => {
    const r = importarCustosFixos([L('Geral', 'Vencimendo Elemento Multimedia', 1, 0, 500, 512)], COMUNIDADES);
    expect(r.custos.every((c) => c.comunidadeId === 'sede' && c.ambito === 'geral')).toBe(true);
  });

  it('avisa e não importa: comunidade desconhecida, linhas repetidas e anos depois do fim da comunidade', () => {
    const r = importarCustosFixos([
      L('Lua', 'Renda', 1, 1, 1, 1),
      L('Sede', 'Anticimex controlo pragas ', 1, 72, 72, 73.73),
      L('Sede', 'Anticimex controlo pragas ', 1, 72, 72, 73.73),
      L('Barreiro', 'Luz ', 1, 100.85, 122.16, 125.09),
    ], COMUNIDADES);
    expect(r.avisos.join('\n')).toMatch(/Lua/);
    expect(r.avisos.join('\n')).toMatch(/repetida/i);
    expect(r.avisos.join('\n')).toMatch(/Barreiro.*2027/);
    expect(r.custos.filter((c) => c.rubrica === 'Controlo de pragas (Anticimex)')).toHaveLength(3);
    const barreiro = r.custos.filter((c) => c.comunidadeId === 'barreiro');
    expect(barreiro.map((c) => [c.inicio, c.fim])).toEqual([['2025-01', '2025-12'], ['2026-01', '2026-10']]);
  });

  it('ids estáveis (reimportar substitui em vez de duplicar)', () => {
    const a = importarCustosFixos([L('Porto', 'Luz ', 1, 1, 2, 3)], COMUNIDADES).custos.map((c) => c.id);
    const b = importarCustosFixos([L('Porto', 'Luz', 1, 1, 2, 3)], COMUNIDADES).custos.map((c) => c.id);
    expect(a).toEqual(b);
    expect(a[0]).toBe('imp-porto-luz-2025');
  });
});
