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

import { estatisticasSaldos, maioresMovimentos, previsaoSaldos, saldosMensais, verificarExtratos } from '../../src/lib/banco';
import type { MovBanco } from '../../src/lib/types';

const mv = (id: string, data: string, valor: number, saldo: number, ordem: number, x: Partial<MovBanco> = {}): MovBanco => ({ id, data, descricao: id, valor, saldo, ordem, contabilizar: false, ...x });
const lote = (contaId: string, mes: number, registos: MovBanco[]): BancoLote => ({ id: `${contaId}_2026_${String(mes).padStart(2, '0')}`, contaId, ano: 2026, mes, periodo: `2026-${String(mes).padStart(2, '0')}`, registos, atualizadoEm: '', atualizadoPor: '' });
const LOTES = [
  lote('cgd', 1, [mv('a', '2026-01-05', 100, 1100, 0), mv('b', '2026-01-20', -300, 800, 1, { categoria: 'Rendas' })]),
  lote('cgd', 2, [mv('c', '2026-02-03', 50, 850, 0, { conciliadoCom: 'depositos:x' })]),
  lote('cgd', 4, [mv('d', '2026-04-03', -100, 700, 0)]), // março em falta e abril não encadeia (850 → 800)
  lote('std', 1, [mv('e', '2026-01-09', 20, 120, 0), mv('f', '2026-01-10', 5, 130, 1)]), // quebra interna: 120 + 5 ≠ 130
];

describe('vista de saldos dos bancos', () => {
  it('saldos mensais por conta e total (meses sem extrato ficam vazios)', () => {
    const s = saldosMensais(LOTES, ['cgd', 'std']);
    expect(s[0]).toMatchObject({ mes: 1, contas: { cgd: { saldoInicial: 1000, entradas: 100, saidas: 300, saldoFinal: 800 }, std: { saldoInicial: 100, saldoFinal: 130 } }, total: { saldoFinal: 930, entradas: 125, saidas: 300 } });
    expect(s[2].contas.cgd).toBeNull();
    expect(s.length).toBe(12);
  });
  it('médias, mínimo, máximo e mês com mais saídas (só meses com extrato)', () => {
    const e = estatisticasSaldos(saldosMensais(LOTES, ['cgd']));
    expect(e).toMatchObject({ meses: 3, entradasMedia: 50, saidasMedia: 133.33, saldoMedio: 783.33, saldoMinimo: { mes: 4, valor: 700 }, saldoMaximo: { mes: 2, valor: 850 }, maisSaidas: { mes: 1, valor: 300 } });
  });
  it('verifica a continuidade dos saldos e os meses em falta', () => {
    const v = verificarExtratos(LOTES, ['cgd', 'std']);
    expect(v).toEqual(expect.arrayContaining([
      { contaId: 'cgd', tipo: 'mes-em-falta', mes: 3, texto: 'Falta o extrato de março.' },
      { contaId: 'cgd', tipo: 'saldo-nao-encadeia', mes: 4, texto: 'O saldo inicial de abril (800,00 €) não é igual ao final do mês anterior (850,00 €).' },
      { contaId: 'std', tipo: 'saldo-interno', mes: 1, texto: '1 movimento em janeiro com saldo que não bate com o anterior.' },
    ]));
    expect(v).toHaveLength(3);
  });
  it('indicadores de classificação e maiores movimentos', () => {
    const s = saldosMensais(LOTES, ['cgd']);
    expect(s[0].contas.cgd).toMatchObject({ classificados: 1, conciliados: 0, n: 2 });
    expect(s[1].contas.cgd).toMatchObject({ classificados: 1, conciliados: 1, n: 1 });
    expect(maioresMovimentos(LOTES[0].registos, 1)).toEqual({ entradas: [LOTES[0].registos[0]], saidas: [LOTES[0].registos[1]] });
  });
  it('saldo previsto até dezembro pela média líquida dos últimos 3 meses com extrato', () => {
    const p = previsaoSaldos(saldosMensais(LOTES, ['cgd', 'std']), 3);
    // último mês com extrato: abril (total 700 só da CGD); média líquida (jan -175, fev +50, abr -100) = -75
    expect(p[0]).toEqual({ mes: 5, saldo: 625 });
    expect(p[p.length - 1]).toEqual({ mes: 12, saldo: 100 });
  });
});
