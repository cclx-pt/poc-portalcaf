import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
const sync = <T,>(v: T) => Object.assign(Promise.resolve(v), { __sync: v });
vi.mock('../../src/auth/AuthProvider', () => ({ useAuth: () => ({ acesso: { email: 'tesouraria@cclx.pt', papel: 'master', nivel: 'confidencial', comunidades: ['*'] }, pode: () => true, temNivel: () => true, sair: () => {} }) }));
vi.mock('../../src/lib/db', () => ({ listarComunidades: () => sync([{ id: 'almada', nome: 'Almada', ordem: 1 }]) }));
vi.mock('../../src/lib/pedidos', () => ({ lerConfigPedidos: () => sync({ ativo: true }) }));
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

  it('menu Dados: "Contribuir" (não "Contribuições")', async () => {
    const { default: Layout } = await import('../../src/components/Layout');
    const html = renderToString(<MemoryRouter initialEntries={['/entradas']}><Routes><Route element={<Layout />}><Route path="entradas" element={<p>x</p>} /></Route></Routes></MemoryRouter>).replace(/<!-- -->/g, '');
    expect(html).toContain('title="Contribuir"');
    expect(html).not.toContain('title="Contribuições"');
  });

  it('rodapé com o código do ecrã e o botão para reportar bugs e melhorias', async () => {
    const { default: Layout } = await import('../../src/components/Layout');
    const html = renderToString(<MemoryRouter initialEntries={['/reconciliacao']}><Routes><Route element={<Layout />}><Route path="reconciliacao" element={<p>x</p>} /></Route></Routes></MemoryRouter>).replace(/<!-- -->/g, '');
    expect(html).toContain('Reportar bug ou melhoria');
    expect(html).toContain('Ecrã TES-02');
    const adm = renderToString(<MemoryRouter initialEntries={['/pedidos']}><Routes><Route element={<Layout />}><Route path="pedidos" element={<p>x</p>} /></Route></Routes></MemoryRouter>).replace(/<!-- -->/g, '');
    expect(adm).toContain('title="Bugs e melhorias"');
    expect(adm).toContain('Ecrã ADM-04');
  });

  it('ordem dos menus: Painel, Dados, Tesouraria, Análise, Registos, Administração', async () => {
    const { default: Layout } = await import('../../src/components/Layout');
    const html = renderToString(<MemoryRouter initialEntries={['/x']}><Routes><Route element={<Layout />}><Route path="x" element={<p>x</p>} /></Route></Routes></MemoryRouter>);
    const pos = ['>Painel<', '>Dados Externos<', '>Tesouraria<', '>Análise<', '>Registos<', '>Administração<'].map((t) => html.indexOf(t));
    expect(pos.every((p) => p > -1)).toBe(true);
    expect([...pos].sort((a, b) => a - b)).toEqual(pos);
  });
});
