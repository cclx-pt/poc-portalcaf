import { describe, expect, it } from 'vitest';
import { filtrarOpcoes, novaDimensao, podeCriarOpcao, valorDaDimensao } from '../../src/lib/escolha';

const ops = [
  { valor: 'CC01', rotulo: 'CC01 Culto e celebrações' },
  { valor: 'CC05', rotulo: 'CC05 Eventos', detalhe: 'Central' },
  { valor: 'CC12', rotulo: 'CC12 Missões' },
];
describe('listas com procura', () => {
  it('procura sem maiúsculas nem acentos, em qualquer parte do texto e no detalhe', () => {
    expect(filtrarOpcoes(ops, 'missoes').map((o) => o.valor)).toEqual(['CC12']);
    expect(filtrarOpcoes(ops, 'CELEBRA').map((o) => o.valor)).toEqual(['CC01']);
    expect(filtrarOpcoes(ops, 'central').map((o) => o.valor)).toEqual(['CC05']);
    expect(filtrarOpcoes(ops, '  ')).toHaveLength(3);
  });
  it('várias palavras: todas têm de aparecer', () => {
    expect(filtrarOpcoes(ops, 'cc0 even').map((o) => o.valor)).toEqual(['CC05']);
  });
  it('só propõe criar quando o texto não é já uma opção', () => {
    expect(podeCriarOpcao(ops, 'Natal')).toBe(true);
    expect(podeCriarOpcao(ops, 'cc05 eventos')).toBe(false);
    expect(podeCriarOpcao(ops, 'CC05')).toBe(false);
    expect(podeCriarOpcao(ops, ' ')).toBe(false);
  });
});

describe('criar um centro de custo, projeto ou fornecedor a partir da lista', () => {
  const dims = [
    { id: 'centro-cc01', tipo: 'centro' as const, codigo: 'CC01', nome: 'Culto' },
    { id: 'centro-cc15', tipo: 'centro' as const, codigo: 'CC15', nome: 'Outros' },
    { id: 'projeto-retiro', tipo: 'projeto' as const, nome: 'Retiro' },
  ];
  it('centro de custo: código seguinte (CC16) e o nome escrito; aceita "CC20 Nome"', () => {
    expect(novaDimensao('centro', 'Festa de Natal', dims)).toEqual({ id: 'centro-cc16', tipo: 'centro', codigo: 'CC16', nome: 'Festa de Natal', ativo: true });
    expect(novaDimensao('centro', 'CC20 Jovens', dims)).toEqual({ id: 'centro-cc20', tipo: 'centro', codigo: 'CC20', nome: 'Jovens', ativo: true });
    expect(novaDimensao('centro', 'X', [])).toMatchObject({ codigo: 'CC01' });
  });
  it('projeto e fornecedor: só o nome', () => {
    expect(novaDimensao('projeto', '  Festa de Natal 2026 ', dims)).toEqual({ id: 'projeto-festa-de-natal-2026', tipo: 'projeto', nome: 'Festa de Natal 2026', ativo: true });
    expect(novaDimensao('fornecedor', 'EDP Comercial', dims)).toEqual({ id: 'fornecedor-edp-comercial', tipo: 'fornecedor', nome: 'EDP Comercial', ativo: true });
  });
  it('o valor que fica escolhido: o código no centro de custo, o nome nos outros', () => {
    expect(valorDaDimensao({ id: 'centro-cc16', tipo: 'centro', codigo: 'CC16', nome: 'Natal' })).toBe('CC16');
    expect(valorDaDimensao({ id: 'projeto-x', tipo: 'projeto', nome: 'X' })).toBe('X');
  });
});
