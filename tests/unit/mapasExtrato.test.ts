import { describe, expect, it } from 'vitest';
import { assinaturaColunas, escolherMapa, mapaCompleto, type MapaExtrato } from '../../src/lib/banco';

const m = (id: string, colunas: string[], campos: MapaExtrato['campos'], extra: Partial<MapaExtrato> = {}): MapaExtrato =>
  ({ id, nome: id, contaId: id, colunas: assinaturaColunas(colunas), campos, ...extra });

describe('mapeamento guardado dos extratos', () => {
  it('a assinatura não depende de maiúsculas, acentos nem ordem', () => {
    expect(assinaturaColunas(['Data', 'Descrição', 'Valor'])).toEqual(assinaturaColunas(['valor', 'DESCRICAO', 'data ']));
  });
  it('escolhe o mapa com as mesmas colunas e, se não houver, um cujas colunas usadas existam no ficheiro', () => {
    const a = m('A', ['Data', 'Texto', 'Valor'], { data: 'Data', descricao: 'Texto', valor: 'Valor' }, { contaId: 'c1' });
    const b = m('B', ['Dt', 'Débito', 'Crédito', 'Desc'], { data: 'Dt', debito: 'Débito', credito: 'Crédito', descricao: 'Desc' });
    expect(escolherMapa(['valor', 'data', 'texto'], [b, a])?.id).toBe('A');
    expect(escolherMapa(['Dt', 'Desc', 'Débito', 'Crédito', 'Saldo'], [a, b])?.id).toBe('B');
    expect(escolherMapa(['Outra', 'Coisa'], [a, b])).toBeNull();
  });
  it('devolve os nomes das colunas tal como estão no ficheiro', () => {
    const a = m('A', ['Data', 'Valor'], { data: 'data', valor: 'VALOR' });
    expect(escolherMapa(['Data ', 'Valor'], [a])?.campos).toEqual({ data: 'Data ', valor: 'Valor' });
  });
  it('um mapa precisa da data e do valor (montante ou débito e crédito)', () => {
    expect(mapaCompleto({ data: 'D', valor: 'V' })).toBe(true);
    expect(mapaCompleto({ data: 'D', debito: 'Db' })).toBe(true);
    expect(mapaCompleto({ valor: 'V' })).toBe(false);
    expect(mapaCompleto({ data: 'D', descricao: 'X' })).toBe(false);
  });
});

describe('mapeamento ligado à conta', () => {
  it('só as contas com mapeamento entram e o ficheiro escolhe a conta', async () => {
    const { mapasDasContas } = await import('../../src/lib/banco');
    const contas = [
      { id: 'mb', nome: 'Millennium', banco: 'Millennium BCP', tipo: 'corrente' as const, mapa: { data: 'Data', valor: 'Montante', descricao: 'Texto' }, mapaColunas: ['data', 'montante', 'texto'] },
      { id: 'cgd', nome: 'CGD', banco: 'Caixa Geral de Depósitos', tipo: 'principal' as const },
    ];
    const ms = mapasDasContas(contas);
    expect(ms.map((m) => m.contaId)).toEqual(['mb']);
    expect(escolherMapa(['Data', 'Texto', 'Montante'], ms)?.contaId).toBe('mb');
  });
});
