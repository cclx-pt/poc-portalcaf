import { describe, expect, it, vi } from 'vitest';
vi.mock('../../src/firebase', () => ({ db: {} }));
import { ordenarPedidos, refPedido, validarPedido, type Pedido } from '../../src/lib/pedidos';

const base: Pedido = { id: 'abc123xyz', tipo: 'bug', titulo: 'Título', descricao: 'Descrição longa', ecra: 'TES-02', ecraNome: 'Reconciliação', caminho: '/reconciliacao', estado: 'novo', criadoPor: 'a@b.pt', criadoEm: '2026-11-20T10:00:00Z' };

describe('bugs e melhorias', () => {
  it('valida tipo, título e descrição', () => {
    expect(validarPedido({ tipo: '', titulo: 'abc', descricao: 'curta' })).toEqual({
      tipo: expect.any(String), titulo: expect.any(String), descricao: expect.any(String),
    });
    expect(validarPedido({ tipo: 'melhoria', titulo: 'Exportar em PDF', descricao: 'Queria exportar o relatório em PDF.' })).toEqual({});
    expect(validarPedido({ tipo: 'bug', titulo: 'x'.repeat(121), descricao: 'Descrição suficiente' }).titulo).toMatch(/120/);
  });

  it('referência curta em maiúsculas', () => {
    expect(refPedido('abc123xyz')).toBe('#ABC123');
  });

  it('abertos primeiro, depois prioridade alta e os mais recentes', () => {
    const ps: Pedido[] = [
      { ...base, id: 'r', estado: 'resolvido', prioridade: 'alta', criadoEm: '2026-11-20T12:00:00Z' },
      { ...base, id: 'b', prioridade: 'baixa', criadoEm: '2026-11-20T11:00:00Z' },
      { ...base, id: 'a1', prioridade: 'alta', criadoEm: '2026-11-19T09:00:00Z' },
      { ...base, id: 'a2', prioridade: 'alta', criadoEm: '2026-11-20T09:00:00Z' },
      { ...base, id: 's', criadoEm: '2026-11-20T08:00:00Z' },
    ];
    expect(ordenarPedidos(ps).map((p) => p.id)).toEqual(['a2', 'a1', 's', 'b', 'r']);
  });
});

import { trabalhoDaAutomacao, analisarTodosPendente, modoEfetivo } from '../../src/lib/pedidosBase';

describe('automação: o que fazer com cada pedido', () => {
  const noite = { modo: 'noite' as const, analisarTodos: false };
  const agora = { modo: 'agora' as const, analisarTodos: false };
  it('pedidos novos sem plano: analisa à noite, ou já com "Analisar agora"', () => {
    expect(trabalhoDaAutomacao(base, noite)).toBe('analisar');
    expect(trabalhoDaAutomacao(base, agora)).toBeNull();
    expect(trabalhoDaAutomacao(base, { modo: 'agora', analisarTodos: true })).toBe('analisar');
  });
  it('plano aprovado sem PR: implementa, a qualquer hora', () => {
    expect(trabalhoDaAutomacao({ ...base, plano: 'x', planoEstado: 'aprovado' }, agora)).toBe('implementar');
    expect(trabalhoDaAutomacao({ ...base, plano: 'x', planoEstado: 'pr-aberto', prUrl: 'u' }, noite)).toBeNull();
  });
  it('plano já proposto não volta a ser analisado, salvo pedido do Master depois do plano', () => {
    const p = { ...base, plano: 'x', planoEm: '2026-11-21T02:00:00Z', planoEstado: 'proposto' as const };
    expect(trabalhoDaAutomacao(p, noite)).toBeNull();
    expect(trabalhoDaAutomacao({ ...p, analisarAgoraEm: '2026-11-21T09:00:00Z' }, agora)).toBe('analisar');
    expect(trabalhoDaAutomacao({ ...p, analisarAgoraEm: '2026-11-20T09:00:00Z' }, agora)).toBeNull();
  });
  it('pedidos fechados não são tratados', () => {
    expect(trabalhoDaAutomacao({ ...base, estado: 'resolvido' }, noite)).toBeNull();
  });
  it('"Analisar agora" para todos fica pendente até à próxima execução', () => {
    expect(analisarTodosPendente({ ativo: true, analisarAgoraEm: '2026-11-21T09:00:00Z', analisarAgoraAtendidoEm: '2026-11-21T02:00:00Z' })).toBe(true);
    // Uma gravação parcial (automacaoEm) não conta como atendido.
    expect(analisarTodosPendente({ ativo: true, analisarAgoraEm: '2026-11-21T09:00:00Z', automacaoEm: '2026-11-21T10:00:00Z' })).toBe(true);
    expect(analisarTodosPendente({ ativo: true, analisarAgoraEm: '2026-11-21T09:00:00Z', analisarAgoraAtendidoEm: '2026-11-21T10:00:00Z' })).toBe(false);
  });
});

describe('cifra dos dados que passam pelo GitHub', () => {
  it('cifra e decifra com a mesma chave; falha com outra', async () => {
    process.env.PEDIDOS_CHAVE = 'k'.repeat(40);
    const { cifrar, decifrar } = await import('../../scripts/cifra');
    const c = cifrar(JSON.stringify({ a: 'Ação €' }));
    expect(c).not.toContain('Ação');
    expect(JSON.parse(decifrar(c))).toEqual({ a: 'Ação €' });
    process.env.PEDIDOS_CHAVE = 'z'.repeat(40);
    expect(() => decifrar(c)).toThrow();
  });
});

describe('retoma quando o plano não tem utilização disponível', () => {
  it('uma verificação de dia faz a análise da noite se a noite não terminou', () => {
    const dia = new Date('2026-11-21T10:17:00Z');
    expect(modoEfetivo('agora', {}, dia)).toBe('noite');
    expect(modoEfetivo('agora', { noiteConcluidaEm: '2026-11-20T02:30:00Z' }, dia)).toBe('noite');
    expect(modoEfetivo('agora', { noiteConcluidaEm: '2026-11-21T02:40:00Z' }, dia)).toBe('agora');
  });
  it('antes das 2h conta a noite anterior', () => {
    expect(modoEfetivo('agora', { noiteConcluidaEm: '2026-11-20T02:40:00Z' }, new Date('2026-11-21T01:17:00Z'))).toBe('agora');
  });
  it('a verificação da noite é sempre da noite', () => {
    expect(modoEfetivo('noite', { noiteConcluidaEm: '2026-11-21T02:40:00Z' }, new Date('2026-11-21T02:17:00Z'))).toBe('noite');
  });
});
