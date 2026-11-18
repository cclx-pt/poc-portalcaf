import { describe, expect, it } from 'vitest';
import { detetarBanco, dividirPorMes, mapaDoBanco, mapearExtrato, ordenarMovimentos, resumoMes } from '../../src/lib/banco';
import type { BancoLote } from '../../src/lib/types';

// Cabeçalhos tal como vêm dos homebankings (já em UTF-8).
const COL_CGD = ['Data mov.', 'Data valor', 'Origem', 'Descrição', 'Movimento', 'Estorno', 'Saldo contabilístico após movimento'];
const COL_SAN = ['Data Operação', 'Data valor', 'Descrição', 'Montante( EUR )', 'Saldo Contabilístico( EUR )', 'Coluna 6'];
const cgd = (d: string, desc: string, mov: string, est: string, saldo: string) => ({ 'Data mov.': d, 'Data valor': d, Origem: 'SIBS ', 'Descrição': desc, Movimento: mov, Estorno: est, 'Saldo contabilístico após movimento': saldo });
const san = (d: string, desc: string, v: string, saldo: string) => ({ 'Data Operação': d, 'Data valor': d, 'Descrição': desc, 'Montante( EUR )': v, 'Saldo Contabilístico( EUR )': saldo, 'Coluna 6': '' });

describe('extratos da CGD e do Santander', () => {
  it('reconhece o banco pelo formato do ficheiro', () => {
    expect(detetarBanco(COL_CGD)).toBe('cgd');
    expect(detetarBanco(COL_SAN)).toBe('santander');
    expect(detetarBanco(['Data', 'Valor'])).toBeNull();
  });

  it('CGD: lê o movimento com sinal, o saldo e os estornos; ordem cronológica (o ficheiro vem do mais recente)', () => {
    const linhas = [
      cgd('09/06/2026', 'CCLX ALMADA ', '275,89', 'E   ', '21.800,49'),
      cgd('09/06/2026', 'CCLX ALMADA ', '-275,89', 'E   ', '21.800,49'),
      cgd('08/06/2026', 'TFI FILOMENA  ', '10', '  ', '21.800,49'),
      cgd('31/05/2026', 'TRF MBWAY 1147 ', '1.176,69', '  ', '21.790,49'),
    ];
    const { movimentos } = mapearExtrato(linhas, mapaDoBanco('cgd', COL_CGD));
    expect(movimentos.map((m) => [m.data, m.descricao, m.valor, m.saldo, !!m.estorno])).toEqual([
      ['2026-06-09', 'CCLX ALMADA', 275.89, 21800.49, true],
      ['2026-06-09', 'CCLX ALMADA', -275.89, 21800.49, true],
      ['2026-06-08', 'TFI FILOMENA', 10, 21800.49, false],
      ['2026-05-31', 'TRF MBWAY 1147', 1176.69, 21790.49, false],
    ]);
    const ord = ordenarMovimentos(movimentos);
    expect(ord.map((m) => m.data)).toEqual(['2026-05-31', '2026-06-08', '2026-06-09', '2026-06-09']);
    expect(ord[ord.length - 1].valor).toBe(275.89); // o mais recente do dia era a primeira linha do ficheiro
  });

  it('Santander: montante com sinal e saldo com espaço de milhares', () => {
    const { movimentos } = mapearExtrato([san('16-11-2026', 'Levantamento Moita', '-200,00', '3 280,68'), san('09-11-2026', 'Trf. MB WAY de X', '1 400,00', '3 480,68')], mapaDoBanco('santander', COL_SAN));
    expect(movimentos.map((m) => [m.data, m.valor, m.saldo])).toEqual([['2026-11-16', -200, 3280.68], ['2026-11-09', 1400, 3480.68]]);
  });

  it('resumo do mês: saldo inicial e final, entradas e saídas', () => {
    const { movimentos } = mapearExtrato([
      san('16-11-2026', 'B', '-200,00', '3 280,68'),
      san('09-11-2026', 'A', '400,00', '3 480,68'),
    ], mapaDoBanco('santander', COL_SAN));
    expect(resumoMes(movimentos)).toEqual({ saldoInicial: 3080.68, entradas: 400, saidas: 200, saldoFinal: 3280.68, n: 2 });
    expect(resumoMes([])).toEqual({ saldoInicial: null, entradas: 0, saidas: 0, saldoFinal: null, n: 0 });
  });

  it('divide por mês, substitui o mês existente e mantém as classificações dos mesmos movimentos', () => {
    const { movimentos } = mapearExtrato([
      san('02-11-2026', 'Garagem Almada', '-80,00', '7 021,11'),
      san('29-10-2026', 'Transferência de C', '500,00', '5 970,61'),
    ], mapaDoBanco('santander', COL_SAN));
    const garagem = movimentos[0];
    const existente: BancoLote = { id: 'santander_2026_11', contaId: 'santander', ano: 2026, mes: 11, periodo: '2026-11', atualizadoEm: '', atualizadoPor: '',
      registos: [{ ...garagem, categoria: 'Rendas', comunidadeId: 'almada', contabilizar: true }, { id: 'velho', data: '2026-11-01', descricao: 'apagado no banco', valor: -1, contabilizar: false }] };
    const r = dividirPorMes('santander', movimentos, [existente], 'ana@x.pt');
    expect(r.lotes.map((l) => l.id)).toEqual(['santander_2026_10', 'santander_2026_11']);
    const nov = r.lotes[1];
    expect(nov.registos.map((m) => m.id)).toEqual([garagem.id]); // substitui: o movimento antigo sai
    expect(nov.registos[0]).toMatchObject({ categoria: 'Rendas', comunidadeId: 'almada', contabilizar: true });
    expect(r.meses).toEqual([
      { periodo: '2026-10', movimentos: 1, antes: 0, classificadosMantidos: 0 },
      { periodo: '2026-11', movimentos: 1, antes: 2, classificadosMantidos: 1 },
    ]);
  });
});
