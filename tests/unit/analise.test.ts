import { describe, expect, it } from 'vitest';
import { linhasDR, totaisPeriodo } from '../../src/lib/analise';
import { OUTROS_FUNCIONAMENTO } from '../../src/lib/rubricas';
import type { Resumo, ResumoMes } from '../../src/lib/types';

function mes(m: number, x: Partial<ResumoMes> = {}): ResumoMes {
  return {
    mes: m, contribuir: 0, coletas: 0, transferencias: 0, quotaBolsa: 0, entradas: 0, custosFixos: 0, despesas: 0, saidas: 0, saldo: 0,
    adultosMedia: null, entradasPorCategoria: {}, despesasPorCategoria: {}, custosRubricas: {}, n: { contribuir: 0, coletas: 0, transferencias: 0, despesas: 0 },
    rubricas: { entrada: {}, saida: {} }, geralEntradas: 0, geralSaidas: 0, pesoGeral: null, adultosMedia12m: null, cedidoGeral: { entradas: 0, custosFixos: 0, despesas: 0 }, ...x,
  };
}
const resumo = (comunidadeId: string, meses: Record<number, Partial<ResumoMes>>): Resumo => ({
  id: `2026_${comunidadeId}`, ano: 2026, comunidadeId, calculadoEm: '', calculadoPor: '',
  meses: Array.from({ length: 12 }, (_, i) => mes(i + 1, meses[i + 1])),
});

const RS = [
  resumo('almada', {
    3: { entradas: 100, saidas: 80, saldo: 20, geralSaidas: 30, adultosMedia: 50, rubricas: { entrada: { Dízimos: { local: 100, geral: 0 } }, saida: { Instalações: { local: 50, geral: 30 } } } },
    4: { entradas: 10, saidas: 0, saldo: 10, adultosMedia: 70, rubricas: { entrada: { Ofertas: { local: 10, geral: 0 } }, saida: {} } },
  }),
  resumo('porto', { 3: { entradas: 40, saidas: 15, saldo: 25, geralSaidas: 15, rubricas: { entrada: { Dízimos: { local: 40, geral: 0 } }, saida: { Instalações: { local: 0, geral: 15 }, [OUTROS_FUNCIONAMENTO]: { local: 0, geral: 0 } } } } }),
];

describe('demonstração de resultados', () => {
  it('soma por rubrica e comunidade, com coluna CCLX', () => {
    const l = linhasDR(RS, 3, 3, false);
    const diz = l.find((x) => x.tipo === 'entrada' && x.rubrica === 'Dízimos')!;
    expect(diz.valores).toEqual({ almada: 100, porto: 40, cclx: 140 });
    const inst = l.find((x) => x.tipo === 'saida' && x.rubrica === 'Instalações')!;
    expect(inst.valores.cclx).toBe(95);
    expect(l.find((x) => x.rubrica === 'Ofertas')!.valores.cclx).toBe(0); // abril fora do período
    expect(l.filter((x) => x.tipo === 'entrada').map((x) => x.rubrica).slice(0, 2)).toEqual(['Dízimos', 'Ofertas']);
  });
  it('separa a parte local e a parte dos gerais', () => {
    const l = linhasDR(RS, 1, 12, true).filter((x) => x.rubrica === 'Instalações');
    expect(l.map((x) => [x.parte, x.valores.cclx])).toEqual([['local', 50], ['geral', 45]]);
  });
  it('totais do período', () => {
    const t = totaisPeriodo(RS[0], 3, 4);
    expect(t).toEqual({ entradas: 110, saidas: 80, resultado: 30, geralEntradas: 0, geralSaidas: 30, dizimos: 100, adultosMedia: 60 });
    expect(totaisPeriodo(RS[1], 1, 12).adultosMedia).toBeNull();
  });
  it('aceita resumos antigos sem rubricas', () => {
    const antigo = resumo('coruche', {});
    for (const x of antigo.meses) delete (x as Partial<ResumoMes>).rubricas;
    expect(() => linhasDR([antigo], 1, 12, false)).not.toThrow();
  });
});
