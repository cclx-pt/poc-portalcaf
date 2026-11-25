import { describe, expect, it } from 'vitest';
import { fundirComJotform, normEmail, normNif, pessoasDoJotform, procurarPessoas, type Pessoa } from '../../src/lib/pessoasBase';
import type { Lote } from '../../src/lib/types';

const lote = (origem: Lote['origem'], comunidadeId: string, regs: Partial<Lote['registos'][number]>[]): Lote => ({
  id: `${origem}_${comunidadeId}`, origem, ano: 2026, mes: 3, periodo: '2026-03', comunidadeId, total: 0, n: regs.length, atualizadoEm: '', atualizadoPor: '',
  registos: regs.map((r, i) => ({ id: `${origem}${comunidadeId}${i}`, data: '2026-03-01', valor: 10, categoria: 'x', ...r })),
});
const pessoa = (p: Partial<Pessoa>): Pessoa => ({ id: 'p1', nome: 'X', telefones: [], emails: [], manual: false, fontes: [], atualizadoEm: '', atualizadoPor: '', ...p });

describe('normalização', () => {
  it('NIF com 9 dígitos, e-mail em minúsculas', () => {
    expect(normNif('PT 123 456 789')).toBe('123456789');
    expect(normNif('12345')).toBeUndefined();
    expect(normEmail(' Ana.Silva@Gmail.COM ')).toBe('ana.silva@gmail.com');
    expect(normEmail('sem-arroba')).toBeUndefined();
  });
});

describe('pessoas a partir do Jotform (Contribuir e Despesas, nível confidencial)', () => {
  it('junta as submissões da mesma pessoa pelo NIF, e-mail ou telefone, com a comunidade mais frequente', () => {
    const ps = pessoasDoJotform([
      lote('contribuir', 'almada', [
        { pessoa: 'Ana Silva', nif: '123456789', email: 'ana@x.pt', telefone: '+351 912 345 678' },
        { pessoa: 'ANA SILVA', nif: '123 456 789' },
      ]),
      lote('despesas', 'almada', [{ pessoa: 'Ana S.', email: 'ANA@x.pt', telefone: '924123727' }]),
      lote('despesas', 'moita', [{ pessoa: 'Ana Silva', telefone: '924123727' }]),
      lote('contribuir', 'porto', [{ pessoa: 'Rui Costa', email: 'rui@x.pt' }]),
    ]);
    expect(ps).toHaveLength(2);
    const ana = ps.find((p) => p.nif === '123456789')!;
    expect(ana).toMatchObject({ nome: 'Ana Silva', comunidadeId: 'almada', emails: ['ana@x.pt'] });
    expect(ana.telefones.sort()).toEqual(['912345678', '924123727']);
    expect(ana.fontes).toHaveLength(4);
    expect(ps.find((p) => p.nome === 'Rui Costa')).toMatchObject({ emails: ['rui@x.pt'], telefones: [], comunidadeId: 'porto' });
  });

  it('ignora registos sem nome, NIF, e-mail nem telefone; sem identificador só o nome não junta pessoas', () => {
    const ps = pessoasDoJotform([lote('contribuir', 'almada', [{}, { pessoa: 'João' }, { pessoa: 'João' }])]);
    expect(ps).toHaveLength(2);
  });
});

describe('atualizar a base existente', () => {
  it('cria as novas, atualiza as automáticas e nas editadas à mão só acrescenta telefones e e-mails', () => {
    const existentes = [
      pessoa({ id: 'a', nome: 'Ana (corrigido)', nif: '123456789', telefones: ['912345678'], emails: [], comunidadeId: 'sede', manual: true }),
      pessoa({ id: 'r', nome: 'Rui', emails: ['rui@x.pt'], comunidadeId: 'almada', manual: false }),
    ];
    const jot = pessoasDoJotform([
      lote('contribuir', 'almada', [{ pessoa: 'Ana Silva', nif: '123456789', telefone: '924123727', email: 'ana@x.pt' }]),
      lote('contribuir', 'porto', [{ pessoa: 'Rui Costa', email: 'rui@x.pt' }, { pessoa: 'Eva', telefone: '933000111' }]),
    ]);
    const r = fundirComJotform(existentes, jot, 'caf@cclx.pt', '2026-11-25T20:00:00Z');
    expect(r.novas.map((p) => p.nome)).toEqual(['Eva']);
    const ana = r.atualizadas.find((p) => p.id === 'a')!;
    expect(ana).toMatchObject({ nome: 'Ana (corrigido)', comunidadeId: 'sede', manual: true, emails: ['ana@x.pt'] });
    expect(ana.telefones.sort()).toEqual(['912345678', '924123727']);
    expect(r.atualizadas.find((p) => p.id === 'r')).toMatchObject({ nome: 'Rui Costa', comunidadeId: 'porto' });
    expect(r.semAlteracao).toBe(0);
  });

  it('não regista alterações quando nada mudou', () => {
    const jot = pessoasDoJotform([lote('contribuir', 'porto', [{ pessoa: 'Rui Costa', email: 'rui@x.pt' }])]);
    const primeira = fundirComJotform([], jot, 'x', 't');
    const segunda = fundirComJotform(primeira.novas, jot, 'x', 't2');
    expect(segunda).toMatchObject({ novas: [], atualizadas: [], semAlteracao: 1 });
  });
});

describe('pesquisa', () => {
  it('por nome (sem acentos), telefone, NIF ou e-mail', () => {
    const ps = [pessoa({ id: '1', nome: 'José Silva', telefones: ['924123727'], nif: '123456789', emails: ['jose@x.pt'] }), pessoa({ id: '2', nome: 'Rui' })];
    expect(procurarPessoas(ps, 'jose').map((p) => p.id)).toEqual(['1']);
    expect(procurarPessoas(ps, '924 123').map((p) => p.id)).toEqual(['1']);
    expect(procurarPessoas(ps, '123456789').map((p) => p.id)).toEqual(['1']);
    expect(procurarPessoas(ps, 'JOSE@X').map((p) => p.id)).toEqual(['1']);
    expect(procurarPessoas(ps, '')).toHaveLength(2);
  });
});

describe('proposta do Jotform: sem nome e Geral ficam de fora', () => {
  it('não propõe pessoas sem nome nem da comunidade Geral', () => {
    const ps = pessoasDoJotform([
      lote('contribuir', 'almada', [{ nif: '111111111', telefone: '912000000' }, { pessoa: 'Ana', nif: '222222222' }]),
      lote('contribuir', 'bolsa-geral', [{ pessoa: 'Rui', email: 'rui@x.pt' }]),
    ]);
    expect(ps.map((p) => p.nome)).toEqual(['Ana']);
  });
});
