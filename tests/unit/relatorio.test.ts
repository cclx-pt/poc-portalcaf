import { describe, expect, it } from 'vitest';
import { mesesDoRelatorio, resumoAnual } from '../../src/lib/relatorio';
import type { Resumo, ResumoMes } from '../../src/lib/types';

function mes(m: number, x: Partial<ResumoMes> = {}): ResumoMes {
  return {
    mes: m, contribuir: 0, coletas: 0, transferencias: 0, quotaBolsa: 0, entradas: 0, custosFixos: 0, despesas: 0, saidas: 0, saldo: 0,
    adultosMedia: null, entradasPorCategoria: {}, despesasPorCategoria: {}, custosRubricas: {}, n: { contribuir: 0, coletas: 0, transferencias: 0, despesas: 0 },
    rubricas: { entrada: {}, saida: {} }, geralEntradas: 0, geralSaidas: 0, pesoGeral: null, adultosMedia12m: null, cedidoGeral: { entradas: 0, custosFixos: 0, despesas: 0 }, ...x,
  };
}
const r = (c: string, ms: Record<number, Partial<ResumoMes>>): Resumo => ({ id: c, ano: 2026, comunidadeId: c, calculadoEm: '', calculadoPor: '', meses: Array.from({ length: 12 }, (_, i) => mes(i + 1, ms[i + 1])) });

const CDR = r('caldas-da-rainha', {
  1: { contribuir: 800, coletas: 200, entradas: 1000, custosFixos: 1500, despesas: 100, saidas: 1600, saldo: -600, adultosMedia: 40 },
  2: { contribuir: 900, coletas: 100, quotaBolsa: 50, entradas: 1100, custosFixos: 1500, despesas: 0, geralSaidas: 200, saidas: 1700, saldo: -600, adultosMedia: 50 },
  3: { contribuir: 999, entradas: 999, saidas: 0, saldo: 999 }, // fora do período (até fevereiro)
});

describe('relatório custos x entradas', () => {
  it('resumo anual até ao mês indicado', () => {
    const a = resumoAnual([CDR], 2);
    expect(a).toMatchObject({ meses: 2, entradas: 2100, contribuir: 1700, coletas: 300, outrasEntradas: 100, custosFixos: 3000, despesas: 100, gerais: 200, saidas: 3300, resultado: -1200, mediaMensalEntradas: 1050, adultosMedia: 45 });
    expect(a.cobertura).toBeCloseTo(2100 / 3300);
  });
  it('soma várias comunidades (CCLX)', () => {
    const a = resumoAnual([CDR, r('porto', { 1: { contribuir: 100, entradas: 100, saidas: 50, custosFixos: 50, saldo: 50, adultosMedia: 10 } })], 2);
    expect(a.entradas).toBe(2200);
    expect(a.adultosMedia).toBe(50); // por mês soma as comunidades (40+10, 50) e depois faz a média dos meses
  });
  it('meses com saldo acumulado', () => {
    const ms = mesesDoRelatorio([CDR], 2);
    expect(ms.map((m) => m.saldoAcumulado)).toEqual([-600, -1200]);
    expect(ms[1]).toMatchObject({ entradas: 1100, custosFixos: 1500, despesas: 0, gerais: 200, saldo: -600, adultosMedia: 50 });
  });
  it('sem saídas, cobertura é nula', () => {
    expect(resumoAnual([r('x', {})], 12).cobertura).toBeNull();
  });
});
