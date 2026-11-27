import { describe, expect, it } from 'vitest';
import { comunidadePorMbway, desfazerFusao, fundirComJotform, fundirPessoas, gruposRepetidos, procurarPessoas, propostaFusao, type Pessoa } from '../../src/lib/pessoasBase';

const p = (x: Partial<Pessoa> & { id: string }): Pessoa => ({ nome: 'X', telefone: '912345678', manual: false, fontes: [], atualizadoEm: '', atualizadoPor: '', ...x });

describe('procurar repetidos', () => {
  const ps = [
    p({ id: 'a1', nome: 'Ana Silva', telefone: '911111111', fontes: ['contribuir:1'] }),
    p({ id: 'a2', nome: 'ANA  SÍLVA', telefone: '911111111', email: 'ana@x.pt' }),
    p({ id: 'b1', nome: 'Rui Costa', telefone: '922222222' }),
    p({ id: 'b2', nome: 'Rui Manuel Costa', telefone: '922222222' }),
    p({ id: 'z1', nome: 'Zé Pinto', telefone: '933333333' }),
    p({ id: 'z2', nome: 'Maria Sousa', telefone: '933333333' }),
    p({ id: 'c1', nome: 'Carla Dias', telefone: '944444444', nif: '123456789' }),
    p({ id: 'c2', nome: 'Carla Dias', telefone: '955555555', nif: '123456789' }),
    p({ id: 'd1', nome: 'Duarte', telefone: '966666666', email: 'd@x.pt' }),
    p({ id: 'd2', nome: 'Duarte Lima', telefone: '977777777', email: 'D@X.pt' }),
  ];
  const gs = gruposRepetidos(ps);
  const de = (id: string) => gs.find((g) => g.ids.includes(id));
  it('A: mesmo telemóvel e mesmo nome (sem maiúsculas, acentos nem espaços)', () => {
    expect(de('a1')).toMatchObject({ tipo: 'A', ids: ['a1', 'a2'] });
  });
  it('B: mesmo telemóvel e nome parecido (um contém o outro, ou mesma primeira e última palavra)', () => {
    expect(de('b1')).toMatchObject({ tipo: 'B', ids: ['b1', 'b2'] });
  });
  it('nomes diferentes no mesmo telemóvel não são repetidos', () => {
    expect(de('z1')).toBeUndefined();
  });
  it('C: mesmo NIF ou mesmo e-mail com telemóvel diferente', () => {
    expect(de('c1')).toMatchObject({ tipo: 'C', ids: ['c1', 'c2'] });
    expect(de('d1')).toMatchObject({ tipo: 'C', ids: ['d1', 'd2'] });
    expect(de('c1')!.motivo).toMatch(/NIF/);
    expect(de('d1')!.motivo).toMatch(/e-mail/);
  });
});

describe('fundir', () => {
  const a = p({ id: 'a1', nome: 'Ana Silva', telefone: '911111111', fontes: ['contribuir:1'], notas: 'Coro' });
  const b = p({ id: 'a2', nome: 'ANA SÍLVA', telefone: '911111111', email: 'ana@x.pt', nif: '123456789', comunidadeId: 'almada', manual: true, fontes: ['despesas:9'] });
  const c = p({ id: 'a3', nome: 'Ana Silva', telefone: '919999999', email: 'ana.silva@y.pt', fontes: ['contribuir:2'], notas: 'Coro' });
  it('proposta: fica a editada à mão (senão a mais completa), com os seus valores', () => {
    expect(propostaFusao([a, b, c])).toEqual({ manterId: 'a2', nome: 'ANA SÍLVA', telefone: '911111111', email: 'ana@x.pt', nif: '123456789', comunidadeId: 'almada' });
    expect(propostaFusao([a, c]).manterId).toBe('a3');
  });
  it('a linha que fica junta tudo: outros telemóveis, outros e-mails nas notas, fontes, e guarda os originais para desfazer', () => {
    const r = fundirPessoas([a, b, c], { manterId: 'a1', nome: 'Ana Silva', telefone: '911111111', email: 'ana@x.pt', nif: '123456789', comunidadeId: 'almada' }, 'm@x.pt', '2026-11-27T23:00:00Z');
    expect(r.apagar).toEqual(['a2', 'a3']);
    expect(r.pessoa).toMatchObject({ id: 'a1', nome: 'Ana Silva', telefone: '911111111', email: 'ana@x.pt', nif: '123456789', comunidadeId: 'almada', manual: true,
      outrosTelefones: ['919999999'], fontes: ['contribuir:1', 'despesas:9', 'contribuir:2'], atualizadoPor: 'm@x.pt' });
    expect(r.pessoa.notas).toBe('Coro · Outros e-mails: ana.silva@y.pt');
    expect(r.pessoa.fusao!.originais.map((x) => x.id)).toEqual(['a1', 'a2', 'a3']);
    expect(r.pessoa.fusao).toMatchObject({ em: '2026-11-27T23:00:00Z', por: 'm@x.pt' });
  });
  it('desfazer repõe as linhas como estavam', () => {
    const r = fundirPessoas([a, b, c], propostaFusao([a, b, c]), 'm@x.pt', 't');
    expect(desfazerFusao(r.pessoa)).toEqual([a, b, c]);
  });
  it('a atualização do Jotform reconhece as linhas fundidas e não as volta a criar', () => {
    const r = fundirPessoas([a, b, c], propostaFusao([a, b, c]), 'm@x.pt', 't');
    const jot = [{ id: 'x', nome: 'Ana Silva', telefone: '919999999', email: 'ana.silva@y.pt', manual: false, fontes: ['contribuir:3'] }];
    expect(fundirComJotform([r.pessoa], jot, 'm', 't')).toMatchObject({ novas: [], semAlteracao: 1 });
  });
  it('os outros telemóveis contam no MB Way e na procura', () => {
    const r = fundirPessoas([a, b, c], propostaFusao([a, b, c]), 'm@x.pt', 't');
    expect(comunidadePorMbway([r.pessoa], 'Trf Mbway 919XXX999')).toMatchObject({ nomes: ['ANA SÍLVA'], comunidadeId: 'almada' });
    expect(procurarPessoas([r.pessoa], '9199999')).toHaveLength(1);
  });
});
