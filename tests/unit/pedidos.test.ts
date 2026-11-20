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
