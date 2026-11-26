import { describe, expect, it } from 'vitest';
import { agruparHistorico, filtrarOrigem, resumoInicio } from '../../src/lib/presencasHistorico';
import type { Lote } from '../../src/lib/types';

const lote = (com: string, mes: number, regs: { id: string; data: string; evento: string; valor: number; extra?: Record<string, unknown> }[]): Lote =>
  ({ id: `assistencia_2026_${mes}_${com}`, origem: 'assistencia', ano: 2026, mes, periodo: `2026-${String(mes).padStart(2, '0')}`, comunidadeId: com, total: 0, n: regs.length, atualizadoEm: '', atualizadoPor: '', registos: regs }) as Lote;

describe('histórico de presenças (Presenças v2)', () => {
  const lotes = [
    lote('almada', 11, [{ id: 'portal-a', data: '2026-11-22', evento: 'Celebração Domingo', valor: 86, extra: { jump: 14, criancas: 9, connects: 5, registadoPor: 'x' } },
      { id: 'b', data: '2026-11-22', evento: 'Oração', valor: 10 }, { id: 'c', data: '2026-11-15', evento: 'Celebração Domingo', valor: 98 }]),
    lote('almada', 10, [{ id: 'd', data: '2026-10-25', evento: 'Celebração Domingo', valor: 109 }]),
  ];
  it('agrupa por mês e dia, mais recentes primeiro, com o total de cada dia e o número de eventos', () => {
    const g = agruparHistorico(lotes);
    expect(g.map((m) => m.mes)).toEqual(['2026-11', '2026-10']);
    expect(g[0].dias.map((d) => [d.data, d.total, d.registos.length])).toEqual([['2026-11-22', 124, 2], ['2026-11-15', 98, 1]]);
    expect(g[0].dias[0].registos[0]).toMatchObject({ lote: { comunidadeId: 'almada' }, registo: { id: 'portal-a' }, total: 114 });
  });
  it('filtra pela origem: portal (registadoPor) ou Jotform', () => {
    expect(filtrarOrigem(lotes, 'portal').flatMap((l) => l.registos.map((r) => r.id))).toEqual(['portal-a']);
    expect(filtrarOrigem(lotes, 'jotform').flatMap((l) => l.registos.map((r) => r.id))).toEqual(['b', 'c', 'd']);
    expect(filtrarOrigem(lotes, undefined)).toBe(lotes);
  });
  it('início: em falta e efetuados dos eventos obrigatórios', () => {
    expect(resumoInicio([{ comunidadeId: 'almada', esperados: 35, comRegisto: 33, emFalta: [{ data: '2026-11-08', evento: 'X' }, { data: '2026-11-15', evento: 'X' }] }]))
      .toEqual({ emFalta: 2, efetuados: 33, esperados: 35 });
  });
});
