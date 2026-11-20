import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
const sync = <T,>(v: T) => Object.assign(Promise.resolve(v), { __sync: v });
vi.mock('../../src/auth/AuthProvider', () => ({ useAuth: () => ({ acesso: { email: 'caf@x.pt', papel: 'caf', nivel: 'confidencial', comunidades: ['*'] }, pode: () => true, temNivel: () => true }) }));
vi.mock('../../src/lib/db', () => ({ auditar: async () => {} }));
vi.mock('../../src/firebase', () => ({ db: {} }));
vi.mock('../../src/lib/pedidos', async (orig) => ({
  ...(await orig<typeof import('../../src/lib/pedidos')>()),
  lerConfigPedidos: () => sync({ ativo: false, alteradoPor: 'caf@x.pt', alteradoEm: '2026-11-20T10:00:00Z' }),
  listarPedidos: () => sync([
    { id: 'aaa111', tipo: 'bug', titulo: 'Gravar não responde', descricao: 'x', ecra: 'TES-02', ecraNome: 'Reconciliação bancária', caminho: '/reconciliacao', estado: 'novo', prioridade: 'alta', criadoPor: 'u@x.pt', criadoEm: '2026-11-20T10:00:00Z' },
    { id: 'bbb222', tipo: 'melhoria', titulo: 'Exportar PDF', descricao: 'y', ecra: 'ANA-03', ecraNome: 'Relatório', caminho: '/analise/relatorio', estado: 'resolvido', criadoPor: 'u@x.pt', criadoEm: '2026-11-19T10:00:00Z' },
  ]),
}));
vi.mock('../../src/components/ui', async (orig) => ({
  ...(await orig<typeof import('../../src/components/ui')>()),
  useCarregar: (fn: () => Promise<unknown> & { __sync?: unknown }) => { const p = fn(); return { dados: p.__sync, erro: null, aCarregar: false, recarregar: async () => {}, setDados: () => {} }; },
}));

describe('Administração › Bugs e melhorias', () => {
  it('mostra o interruptor, os KPIs e só os pedidos abertos por omissão', async () => {
    const { default: Pedidos } = await import('../../src/pages/Pedidos');
    const html = renderToString(<MemoryRouter><Pedidos /></MemoryRouter>).replace(/<!-- -->/g, '');
    expect(html).toContain('role="switch"');
    expect(html).toContain('Desligado');
    expect(html).toContain('Gravar não responde');
    expect(html).toContain('#AAA111');
    expect(html).toContain('TES-02');
    expect(html).not.toContain('Exportar PDF');
  });
});
