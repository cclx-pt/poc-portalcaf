import { describe, expect, it } from 'vitest';
import { mapaNomesCategorias, renomearEmCustos, renomearEmLotesBanco, renomearEmOrcamento, renomearEmRegras, validarNovoNome } from '../../src/lib/renomearCategoria';
import type { BancoLote, Categoria, CustoFixo, Orcamento } from '../../src/lib/types';
import type { RegraBanco } from '../../src/lib/classificacaoBanco';

const cat = (x: Partial<Categoria>): Categoria => ({ id: 'plano-02-03', nome: '02.03 Comunicações', tipo: 'saida', codigo: '02.03', atividade: '', nivel: 'privado', ...x });
const A = '02.03 Comunicações', N = '02.03 Telecomunicações';

describe('mudar o nome de uma categoria', () => {
  it('o novo nome tem de começar pelo código, ser diferente e não existir', () => {
    const c = cat({});
    const outras = [c, cat({ id: 'plano-02-04', nome: '02.04 Limpeza', codigo: '02.04' })];
    expect(validarNovoNome(c, N, outras)).toBeNull();
    expect(validarNovoNome(c, '  02.03   Telecomunicações ', outras)).toBeNull();
    expect(validarNovoNome(c, 'Telecomunicações', outras)).toMatch(/começar pelo código "02.03"/);
    expect(validarNovoNome(c, '02.04 Limpeza', outras)).toMatch(/começar pelo código/);
    expect(validarNovoNome(cat({ codigo: undefined }), '02.04 limpeza', outras)).toMatch(/Já existe/);
    expect(validarNovoNome(c, '', outras)).toMatch(/Indique/);
    expect(validarNovoNome(c, '02.03', outras)).toMatch(/Indique/);
  });
  it('os nomes antigos continuam a apontar para o nome atual', () => {
    const m = mapaNomesCategorias([cat({ nome: N, nomesAnteriores: [A, '02.03 Telefone'] })]);
    expect(m.get(A)).toBe(N);
    expect(m.get('02.03 Telefone')).toBe(N);
    expect(m.get(N)).toBeUndefined();
  });
  it('movimentos bancários: categoria e linhas divididas; só os lotes que mudam', () => {
    const lotes = [
      { id: 'b1', periodo: '2026-10', registos: [{ id: 'm1', categoria: A }, { id: 'm2', categoria: 'Outra', partes: [{ categoria: A, comunidadeId: 'x', valor: -1 }] }] },
      { id: 'b2', periodo: '2026-11', registos: [{ id: 'm3', categoria: 'Outra' }] },
    ] as unknown as BancoLote[];
    const r = renomearEmLotesBanco(lotes, A, N);
    expect(r.map((l) => l.id)).toEqual(['b1']);
    expect(r[0].registos[0].categoria).toBe(N);
    expect(r[0].registos[1].partes![0].categoria).toBe(N);
    expect(lotes[0].registos[0].categoria).toBe(A);
  });
  it('custos fixos, regras dos extratos (e as suas linhas) e orçamentos', () => {
    expect(renomearEmCustos([{ id: 'c1', categoria: A }, { id: 'c2', categoria: 'X' }] as CustoFixo[], A, N)).toEqual([{ id: 'c1', categoria: N }]);
    expect(renomearEmRegras([{ id: 'r1', padrao: 'MEO', categoria: 'X', partes: [{ comunidadeId: 'a', categoria: A }] }] as RegraBanco[], A, N)[0].partes![0].categoria).toBe(N);
    const o = { ano: 2026, linhas: [{ comunidadeId: 'a', grupo: 'despesas', categoria: A, anual: 10 }] } as unknown as Orcamento;
    expect(renomearEmOrcamento([o], A, N)[0].linhas[0].categoria).toBe(N);
    expect(renomearEmOrcamento([o], 'nada', N)).toEqual([]);
  });
});
