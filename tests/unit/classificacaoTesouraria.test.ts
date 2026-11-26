import { describe, expect, it } from 'vitest';
import { aplicarClassificacaoTesouraria, dimensoesEmFalta, lerFolhaTesouraria } from '../../src/lib/classificacaoTesouraria';
import { categoriasDoPlano } from '../../src/lib/plano';
import type { Comunidade, Dimensao, MovBanco } from '../../src/lib/types';

const COL = ['Data', 'Mês', 'Descrição (banco)', 'Valor (€)', 'Conta', 'C/D (folha)', 'Categoria (folha)', 'Subcategoria (folha)', '3.ª categoria (folha)', 'CC (folha)',
  'Categoria (plano)', 'Comunidade', 'Centro de custo', 'Projeto ou evento', 'Fornecedor', 'Conta analítica', 'Tratamento no portal', 'Confiança', 'Nota'];
const linha = (data: string, desc: string, valor: number, cat: string, com: string, cc = '', extra: Record<string, unknown> = {}) =>
  ({ ...Object.fromEntries(COL.map((c) => [c, ''])), Data: new Date(`${data}T00:00:00Z`), 'Descrição (banco)': desc, 'Valor (€)': valor,
    'Categoria (plano)': cat, Comunidade: com, 'Centro de custo': cc, Confiança: 'Alta', ...extra });
const cats = categoriasDoPlano();
const coms = [{ id: 'sede', nome: 'Sede' }, { id: 'moita', nome: 'Moita' }, { id: 'bolsa-geral', nome: 'Geral', especial: true }] as Comunidade[];
const mov = (id: string, data: string, valor: number, descricao: string, x: Partial<MovBanco> = {}): MovBanco => ({ id, data, valor, descricao, contabilizar: false, ...x });

describe('folha de classificação da tesouraria', () => {
  it('lê as linhas e ignora pendentes (Baixa), linhas sem valor, as que o portal trata por outra fonte e as sem comunidade', () => {
    const { linhas, ignoradas } = lerFolhaTesouraria({ colunas: COL, linhas: [
      linha('2026-03-05', 'RENDA CCLX SEDE', -1500, '02.01 Rendas e condomínios', 'Sede', 'CC02 Operações locais'),
      linha('2026-03-05', 'X', -10, '07.04 Apoios individuais', 'Sede', 'CC11 Missões', { Confiança: 'Baixa' }),
      linha('2026-03-05', 'Y', 0, '', '', '', { Confiança: 'Ignorar' }),
      linha('2026-03-06', 'TRF IFTHENPAY LDA - 99,05€', 40, 'R1.01 Dízimos', 'Sede', 'CC02 Operações locais', { 'Tratamento no portal': 'Lote IFTHENPAY: …' }),
      linha('2026-03-07', 'Z', -5, '04.05 Consumíveis e utensílios', '', 'CC02 Operações locais'),
    ] });
    expect(linhas).toEqual([{ data: '2026-03-05', descricao: 'RENDA CCLX SEDE', valor: -1500, codigo: '02.01', comunidade: 'Sede', centro: 'CC02' }]);
    expect(ignoradas).toBe(4);
  });
});

describe('aplicar aos movimentos do portal', () => {
  const ctx = { categorias: cats, comunidades: coms, quando: '25/11/2026' };
  it('propõe categoria, comunidade, centro de custo, projeto e fornecedor no movimento com a mesma data e valor', () => {
    const r = aplicarClassificacaoTesouraria([mov('a', '2026-03-05', -1500, 'RENDA CCLX SEDE')],
      [{ data: '2026-03-05', descricao: 'RENDA CCLX SEDE', valor: -1500, codigo: '02.01', comunidade: 'Sede', centro: 'CC02', projeto: 'Obras Sede', fornecedor: 'X' }], ctx);
    expect(r.alterados).toHaveLength(1);
    expect(r.alterados[0]).toMatchObject({ id: 'a', estado: 'proposto', categoria: '02.01 Rendas e condomínios', comunidadeId: 'sede', centroCusto: 'CC02', projeto: 'Obras Sede', fornecedor: 'X', contabilizar: false });
    expect(r.alterados[0].nota).toMatch(/tesouraria/i);
  });
  it('linhas do mesmo movimento (mesma data e descrição) somam o valor e ficam como linhas do movimento', () => {
    const r = aplicarClassificacaoTesouraria([mov('a', '2026-03-05', -300, 'EDP COMERCIAL')], [
      { data: '2026-03-05', descricao: 'EDP COMERCIAL', valor: -100, codigo: '02.02', comunidade: 'Moita', centro: 'CC02' },
      { data: '2026-03-05', descricao: 'EDP COMERCIAL', valor: -200, codigo: '02.02', comunidade: 'Sede', centro: 'CC02' },
    ], ctx);
    expect(r.alterados[0]).toMatchObject({ categoria: '02.02 Energia e água', comunidadeId: undefined, partes: [
      { comunidadeId: 'moita', valor: -100, categoria: '02.02 Energia e água', centroCusto: 'CC02' },
      { comunidadeId: 'sede', valor: -200, categoria: '02.02 Energia e água', centroCusto: 'CC02' },
    ] });
  });
  it('não mexe em movimentos validados ou conciliados, e conta o que ficou sem par', () => {
    const r = aplicarClassificacaoTesouraria([
      mov('v', '2026-03-05', -45, 'MEO', { estado: 'validado', categoria: '02.03 Comunicações' }),
      mov('c', '2026-03-06', 135, 'DEP', { conciliadoCom: 'depositos:d1' }),
    ], [
      { data: '2026-03-05', descricao: 'MEO', valor: -45, codigo: '02.03', comunidade: 'Sede', centro: 'CC02' },
      { data: '2026-03-06', descricao: 'DEP', valor: 135, codigo: 'R1.02', comunidade: 'Sede', centro: 'CC02' },
      { data: '2026-04-01', descricao: 'NADA', valor: -1, codigo: '04.05', comunidade: 'Sede', centro: 'CC02' },
    ], ctx);
    expect(r.alterados).toHaveLength(0);
    expect(r).toMatchObject({ jaTratados: 2, semPar: 1 });
  });
  it('data a até 3 dias de distância só quando há um único movimento com esse valor; a descrição desempata no mesmo dia', () => {
    const r = aplicarClassificacaoTesouraria([
      mov('a', '2026-03-07', -20, 'PORTAGENS'),
      mov('b', '2026-03-10', -33, 'MEO SA'), mov('c', '2026-03-10', -33, 'VODAFONE PORTUGAL'),
    ], [
      { data: '2026-03-05', descricao: 'PORTAGENS', valor: -20, codigo: '04.04', comunidade: 'Sede', centro: 'CC02' },
      { data: '2026-03-10', descricao: 'VODAFONE PORTUGAL COM', valor: -33, codigo: '02.03', comunidade: 'Moita', centro: 'CC02' },
    ], ctx);
    expect(r.alterados.map((m) => [m.id, m.comunidadeId])).toEqual([['a', 'sede'], ['c', 'moita']]);
  });
  it('comunidade ou categoria desconhecidas no portal ficam de fora', () => {
    const r = aplicarClassificacaoTesouraria([mov('a', '2026-03-05', -10, 'X')], [{ data: '2026-03-05', descricao: 'X', valor: -10, codigo: '99.99', comunidade: 'Sede', centro: 'CC02' }], ctx);
    expect(r).toMatchObject({ alterados: [], desconhecidas: 1 });
  });
});

describe('dimensões em falta', () => {
  it('centros de custo do plano, projetos, fornecedores e contas analíticas que ainda não existem', () => {
    const dims = [{ id: 'centro-cc02', tipo: 'centro', codigo: 'CC02', nome: 'Operações locais', ativo: true }, { id: 'fornecedor-meo', tipo: 'fornecedor', nome: 'MEO' }] as Dimensao[];
    const novas = dimensoesEmFalta([
      { data: '', descricao: '', valor: -1, codigo: '06.01', comunidade: 'Sede', centro: 'CC06', projeto: 'Retiro B1 2026', fornecedor: 'MEO' },
      { data: '', descricao: '', valor: -1, codigo: '03.04', comunidade: 'Sede', centro: 'CC02', fornecedor: 'Zoom', contaAnalitica: 'Videoconferência' },
    ], dims);
    expect(novas).toEqual([
      { id: 'centro-cc06', tipo: 'centro', codigo: 'CC06', nome: 'B1', ambito: 'Ministério', ativo: true },
      { id: 'projeto-retiro-b1-2026', tipo: 'projeto', nome: 'Retiro B1 2026', ativo: true },
      { id: 'fornecedor-zoom', tipo: 'fornecedor', nome: 'Zoom', ativo: true },
      { id: 'conta-videoconferencia', tipo: 'conta', nome: 'Videoconferência', categoria: '03.04', ativo: true },
    ]);
  });
});
