import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
const sync = <T,>(v: T) => Object.assign(Promise.resolve(v), { __sync: v });
vi.mock('../../src/auth/AuthProvider', () => ({ useAuth: () => ({ acesso: { email: 'tesouraria@cclx.pt', papel: 'master', nivel: 'confidencial', comunidades: ['*'] }, pode: () => true, temNivel: () => true, sair: () => {} }) }));
vi.mock('../../src/lib/db', () => ({ listarComunidades: () => sync([{ id: 'almada', nome: 'Almada', ordem: 1 }]) }));
vi.mock('../../src/components/ui', async (orig) => ({
  ...(await orig<typeof import('../../src/components/ui')>()),
  useCarregar: (fn: () => Promise<unknown> & { __sync?: unknown }) => { const p = fn(); return { dados: p.__sync, erro: null, aCarregar: false, recarregar: async () => {} }; },
  useFiltros: () => ({ ano: 2026, setAno: () => {}, comunidade: 'todas', setComunidade: () => {} }),
}));

describe('layout em telemóvel e tablet', () => {
  it('tem botão de menu (fechado por omissão) e os links dentro de um bloco recolhível', async () => {
    const { default: Layout } = await import('../../src/components/Layout');
    const html = renderToString(<MemoryRouter initialEntries={['/x']}><Routes><Route element={<Layout />}><Route path="x" element={<p>conteudo</p>} /></Route></Routes></MemoryRouter>);
    expect(html).toMatch(/class="menu-botao"[^>]*aria-expanded="false"/);
    expect(html).toContain('class="side-links"');
    expect(html).toMatch(/class="grupo-botao"[^>]*aria-expanded="false"[^>]*>.*?Registos/s);
  });

  it('painel lateral recolhível e grupos que abrem e fecham (o da página atual aberto)', async () => {
    const { default: Layout } = await import('../../src/components/Layout');
    const html = renderToString(<MemoryRouter initialEntries={['/analise/resultados']}><Routes><Route element={<Layout />}><Route path="analise/resultados" element={<p>x</p>} /></Route></Routes></MemoryRouter>);
    expect(html).toMatch(/aria-label="Recolher o menu"/);
    expect(html).toMatch(/class="grupo-botao"[^>]*aria-expanded="true"[^>]*>.*?Análise/s);
    expect(html).toMatch(/class="grupo-botao"[^>]*aria-expanded="false"[^>]*>.*?Tesouraria/s);
    expect(html).toContain('title="Demonstração de resultados"');
  });
});

