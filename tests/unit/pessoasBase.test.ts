import { describe, expect, it } from 'vitest';
import { fundirComJotform, normEmail, normNif, pessoasDoJotform, procurarPessoas, validarPessoa, type Pessoa } from '../../src/lib/pessoasBase';
import type { Lote } from '../../src/lib/types';

const lote = (origem: Lote['origem'], comunidadeId: string, regs: Partial<Lote['registos'][number]>[]): Lote => ({
  id: `${origem}_${comunidadeId}`, origem, ano: 2026, mes: 3, periodo: '2026-03', comunidadeId, total: 0, n: regs.length, atualizadoEm: '', atualizadoPor: '',
  registos: regs.map((r, i) => ({ id: `${origem}${comunidadeId}${i}`, data: '2026-03-01', valor: 10, categoria: 'x', ...r })),
});
const pessoa = (p: Partial<Pessoa>): Pessoa => ({ id: 'p1', nome: 'X', telefone: '912345678', manual: false, fontes: [], atualizadoEm: '', atualizadoPor: '', ...p });

describe('normalização', () => {
  it('NIF com 9 dígitos, e-mail em minúsculas', () => {
    expect(normNif('PT 123 456 789')).toBe('123456789');
    expect(normNif('12345')).toBeUndefined();
    expect(normEmail(' Ana.Silva@Gmail.COM ')).toBe('ana.silva@gmail.com');
    expect(normEmail('sem-arroba')).toBeUndefined();
  });
});

describe('pessoas a partir do Jotform: uma linha por nome + telemóvel + e-mail, sem agrupar', () => {
  it('cada combinação diferente de telemóvel ou e-mail é uma linha; submissões iguais não repetem a linha', () => {
    const ps = pessoasDoJotform([
      lote('contribuir', 'almada', [
        { pessoa: 'Ana Silva', nif: '123456789', email: 'ana@x.pt', telefone: '+351 912 345 678' },
        { pessoa: 'Ana Silva', nif: '123 456 789', email: 'ANA@x.pt', telefone: '912345678' },
      ]),
      lote('despesas', 'almada', [{ pessoa: 'Ana Silva', email: 'ana@x.pt', telefone: '924123727' }]),
    ]);
    expect(ps).toHaveLength(2);
    expect(ps.map((p) => p.telefone).sort()).toEqual(['912345678', '924123727']);
    const a = ps.find((p) => p.telefone === '912345678')!;
    expect(a).toMatchObject({ nome: 'Ana Silva', email: 'ana@x.pt', nif: '123456789', comunidadeId: 'almada' });
    expect(a.fontes).toHaveLength(2);
  });

  it('não grava sem nome, sem telemóvel ou da comunidade Geral', () => {
    const ps = pessoasDoJotform([
      lote('contribuir', 'almada', [{ nif: '111111111', telefone: '912000000' }, { pessoa: 'Rui', email: 'rui@x.pt' }, { pessoa: 'Eva', telefone: '933000111' }]),
      lote('contribuir', 'bolsa-geral', [{ pessoa: 'Tó', telefone: '966000111' }]),
    ]);
    expect(ps.map((p) => p.nome)).toEqual(['Eva']);
  });

  it('vários telemóveis colados no mesmo campo: uma linha por telemóvel', () => {
    const ps = pessoasDoJotform([lote('despesas', 'moita', [{ pessoa: 'Zé', telefone: '912345678 924123727' }])]);
    expect(ps.map((p) => p.telefone).sort()).toEqual(['912345678', '924123727']);
  });
});

describe('atualizar a base existente', () => {
  it('cria as linhas novas e não mexe nas que já existem (editadas à mão ou não)', () => {
    const existentes = [
      pessoa({ id: 'a', nome: 'Ana (corrigido)', telefone: '912345678', comunidadeId: 'sede', manual: true }),
      pessoa({ id: 'r', nome: 'Rui', telefone: '933000222', comunidadeId: 'almada', manual: false }),
    ];
    const jot = pessoasDoJotform([
      lote('contribuir', 'almada', [{ pessoa: 'Ana (corrigido)', telefone: '912345678', nif: '123456789' }]),
      lote('contribuir', 'porto', [{ pessoa: 'Rui', telefone: '933000222', email: 'rui@x.pt' }, { pessoa: 'Eva', telefone: '933000111' }]),
    ]);
    const r = fundirComJotform(existentes, jot, 'caf@cclx.pt', '2026-11-25T20:00:00Z');
    expect(r.novas.map((p) => p.nome).sort()).toEqual(['Eva', 'Rui']);
    expect(r.atualizadas).toEqual([]);
    expect(r.semAlteracao).toBe(1);
  });

  it('atualiza uma linha automática igual (NIF, comunidade, fontes) e não regista alterações quando nada mudou', () => {
    const jot = pessoasDoJotform([lote('contribuir', 'porto', [{ pessoa: 'Rui Costa', telefone: '933000222' }])]);
    const primeira = fundirComJotform([], jot, 'x', 't');
    expect(fundirComJotform(primeira.novas, jot, 'x', 't2')).toMatchObject({ novas: [], atualizadas: [], semAlteracao: 1 });
    const jot2 = pessoasDoJotform([lote('contribuir', 'porto', [{ pessoa: 'Rui Costa', telefone: '933000222', nif: '123456789' }])]);
    const r = fundirComJotform(primeira.novas, jot2, 'x', 't3');
    expect(r.atualizadas).toHaveLength(1);
    expect(r.atualizadas[0].nif).toBe('123456789');
  });
});

describe('validação ao gravar à mão', () => {
  it('nome e telemóvel obrigatórios; um telemóvel e um e-mail por linha', () => {
    expect(validarPessoa({ nome: '', telefone: '912345678' })).toMatch(/nome/i);
    expect(validarPessoa({ nome: 'Ana', telefone: '' })).toMatch(/telemóvel/i);
    expect(validarPessoa({ nome: 'Ana', telefone: '912345678, 924123727' })).toMatch(/um só telemóvel/i);
    expect(validarPessoa({ nome: 'Ana', telefone: '912345678', email: 'a@x.pt, b@x.pt' })).toMatch(/um só e-mail/i);
    expect(validarPessoa({ nome: 'Ana', telefone: '+351 912 345 678', email: 'a@x.pt', nif: '123456789' })).toBeNull();
  });
});

describe('pesquisa', () => {
  it('por nome (sem acentos), telefone, NIF ou e-mail', () => {
    const ps = [pessoa({ id: '1', nome: 'José Silva', telefone: '924123727', nif: '123456789', email: 'jose@x.pt' }), pessoa({ id: '2', nome: 'Rui', telefone: '911111111' })];
    expect(procurarPessoas(ps, 'jose').map((p) => p.id)).toEqual(['1']);
    expect(procurarPessoas(ps, '924 123').map((p) => p.id)).toEqual(['1']);
    expect(procurarPessoas(ps, '123456789').map((p) => p.id)).toEqual(['1']);
    expect(procurarPessoas(ps, 'JOSE@X').map((p) => p.id)).toEqual(['1']);
    expect(procurarPessoas(ps, '')).toHaveLength(2);
  });
});
