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

describe('limpar extrato: só meses abertos', () => {
  it('lista os meses com extrato e marca os fechados', async () => {
    const { mesesParaLimpar } = await import('../../src/lib/banco');
    const l = (contaId: string, mes: number, n: number) => ({ id: `${contaId}-${mes}`, contaId, ano: 2026, mes, periodo: `2026-${String(mes).padStart(2, '0')}`, registos: Array.from({ length: n }, () => ({})), atualizadoEm: '', atualizadoPor: '' });
    const r = mesesParaLimpar([l('cgd', 2, 3), l('sant', 2, 1), l('cgd', 1, 5), l('cgd', 3, 2)] as never, new Set(['2026-01']));
    expect(r).toEqual([
      { mes: 1, periodo: '2026-01', fechado: true, movimentos: 5, contas: ['cgd'] },
      { mes: 2, periodo: '2026-02', fechado: false, movimentos: 4, contas: ['cgd', 'sant'] },
      { mes: 3, periodo: '2026-03', fechado: false, movimentos: 2, contas: ['cgd'] },
    ]);
  });
});

describe('extratos sem linha de cabeçalho e verificação dos saldos', () => {
  it('CSV sem cabeçalho: colunas "Coluna 1…" e a primeira linha não se perde', async () => {
    const { paraTabela } = await import('../../src/lib/ficheiros');
    const t = paraTabela([['18/11/2026', '17/11/2026', '2,0 COM SB', '-0,37', '19.855,25', ''], ['17/11/2026', '17/11/2026', 'ZOOM.COM', '-17,97', '19.855,62', '']]);
    expect(t.colunas.slice(0, 5)).toEqual(['Coluna 1', 'Coluna 2', 'Coluna 3', 'Coluna 4', 'Coluna 5']);
    expect(t.linhas).toHaveLength(2);
    expect(t.linhas[0]['Coluna 3']).toBe('2,0 COM SB');
    const comCab = paraTabela([['Data mov.', 'Descrição', 'Montante'], ['18/11/2026', 'X', '1,00']]);
    expect(comCab.colunas).toEqual(['Data mov.', 'Descrição', 'Montante']);
    expect(comCab.linhas).toHaveLength(1);
  });
  it('um movimento sem saldo não conta como quebra', async () => {
    const { verificarExtratos } = await import('../../src/lib/banco');
    const mv = (o: number, valor: number, saldo: number | null) => ({ id: `m${o}`, data: '2026-01-05', descricao: 'X', valor, saldo, ordem: o, contabilizar: false, conciliadoCom: null, sugestao: null });
    const lote = { id: 'l', contaId: 'c', ano: 2026, mes: 1, periodo: '2026-01', registos: [mv(0, -10, 90), mv(1, -20, null), mv(2, -5, 65)], atualizadoEm: '', atualizadoPor: '' };
    expect(verificarExtratos([lote] as never, ['c'])).toEqual([]);
  });
  it('sugere a coluna da data que encadeia os saldos (data do movimento, não a data valor)', async () => {
    const { melhorColunaData } = await import('../../src/lib/banco');
    const l = (a: string, b: string, v: string, s: string) => ({ A: a, B: b, C: 'x', D: v, E: s });
    // Mais recente primeiro; o 2.º movimento tem data valor anterior.
    const linhas = [l('16/11/2026', '16/11/2026', '10', '120'), l('16/11/2026', '14/11/2026', '-5', '110'), l('15/11/2026', '15/11/2026', '15', '115')];
    expect(melhorColunaData(linhas, { data: 'B', descricao: 'C', valor: 'D', saldo: 'E' }, ['A', 'B', 'C', 'D', 'E'])).toEqual({ coluna: 'A', quebras: 0, quebrasAtual: 2 });
    expect(melhorColunaData(linhas, { data: 'A', descricao: 'C', valor: 'D', saldo: 'E' }, ['A', 'B', 'C', 'D', 'E'])).toBeNull();
  });
});

describe('amostra do extrato', () => {
  it('mostra as 3 primeiras linhas e o campo de cada coluna escolhida', async () => {
    const { renderToString } = await import('react-dom/server');
    const { createElement } = await import('react');
    const { AmostraExtrato } = await import('../../src/components/MapaExtratoEditor');
    const linhas = [1, 2, 3, 4].map((i) => ({ 'Coluna 1': `0${i}/11/2026`, 'Coluna 2': `Mov ${i}`, 'Coluna 3': `-${i},00` }));
    const html = renderToString(createElement(AmostraExtrato, { colunas: ['Coluna 1', 'Coluna 2', 'Coluna 3'], linhas, mapa: { data: 'Coluna 1', valor: 'Coluna 3' } }));
    expect(html).toContain('Mov 3');
    expect(html).not.toContain('Mov 4');
    expect(html).toContain('→ Data');
    expect(html).toContain('→ Montante (com sinal)');
  });
});
