import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
const sync = <T,>(v: T) => Object.assign(Promise.resolve(v), { __sync: v });
vi.mock('../../src/auth/AuthProvider', () => ({ useAuth: () => ({ acesso: { email: 'caf@cclx.pt', papel: 'caf', nivel: 'confidencial', comunidades: ['*'] }, pode: () => true, temNivel: () => true }) }));
vi.mock('../../src/firebase', () => ({ db: {} }));
vi.mock('../../src/lib/db', () => ({ listarComunidades: () => sync([{ id: 'almada', nome: 'Almada', ordem: 1 }]), listarLotes: async () => [], auditar: async () => {} }));
vi.mock('../../src/lib/pessoas', async (orig) => ({
  ...(await orig<typeof import('../../src/lib/pessoas')>()),
  listarPessoas: () => sync([{ id: 'nif-123456789', nome: 'Ana Silva', telefones: ['912345678'], nif: '123456789', emails: ['ana@x.pt'], comunidadeId: 'almada', manual: false, fontes: ['contribuir:1', 'despesas:2'], atualizadoEm: '', atualizadoPor: '' }]),
}));
vi.mock('../../src/components/ui', async (orig) => ({
  ...(await orig<typeof import('../../src/components/ui')>()),
  useCarregar: (fn: () => Promise<unknown> & { __sync?: unknown }) => { const p = fn(); return { dados: p.__sync, erro: null, aCarregar: false, recarregar: async () => {} }; },
  useFiltros: () => ({ ano: 2026, setAno: () => {}, comunidade: 'todas', setComunidade: () => {} }),
}));

describe('Administração › Pessoas (ADM-06)', () => {
  it('lista nome, telefones, contribuinte, e-mail e comunidade, com a atualização a partir do Jotform', async () => {
    const { default: Pessoas } = await import('../../src/pages/Pessoas');
    const html = renderToString(<MemoryRouter><Pessoas /></MemoryRouter>).replace(/<!-- -->/g, '');
    expect(html).toMatch(/Jotform<span[^>]*> · 2 registos/);
    for (const t of ['Pessoas (dados de referência)', 'Ana Silva', '912 345 678', '123456789', 'ana@x.pt', 'Almada', 'Atualizar a partir do Jotform (2025 e 2026)', 'Nova pessoa']) expect(html).toContain(t);
  });
});
