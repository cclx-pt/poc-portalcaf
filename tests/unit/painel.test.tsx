import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
const sync = <T,>(v: T) => Object.assign(Promise.resolve(v), { __sync: v });
vi.mock('../../src/auth/AuthProvider', () => ({ useAuth: () => ({ acesso: { email: 'm@x.pt', papel: 'master', nivel: 'confidencial', comunidades: ['*'] }, pode: () => true, temNivel: () => true }) }));
vi.mock('../../src/firebase', () => ({ db: {} }));
vi.mock('../../src/lib/recalcular', () => ({ recalcularAno: async () => {} }));
const mes = (m: number, entradas: number, previsao: boolean) => ({
  mes: m, contribuir: entradas, coletas: 0, transferencias: 0, quotaBolsa: 0, entradas, custosFixos: 100, despesas: 0, saidas: 100, saldo: entradas - 100,
  adultosMedia: null, entradasPorCategoria: {}, despesasPorCategoria: {}, custosRubricas: {}, n: { contribuir: 1, coletas: 0, transferencias: 0, despesas: 0 },
  rubricas: { entrada: {}, saida: {} }, geralEntradas: 0, geralSaidas: 0, pesoGeral: null, adultosMedia12m: null, cedidoGeral: { entradas: 0, custosFixos: 0, despesas: 0 }, previsao,
});
vi.mock('../../src/lib/db', () => ({
  listarComunidades: () => sync([{ id: 'almada', nome: 'Almada', ordem: 1 }]),
  listarResumos: () => sync([{ id: '2026_almada', ano: 2026, comunidadeId: 'almada', calculadoEm: '2026-11-20T10:00:00Z', calculadoPor: '',
    meses: Array.from({ length: 12 }, (_, i) => mes(i + 1, i === 0 ? 1000 : i === 1 ? 2000 : 0, i >= 1)) }]),
  lerEstadoSync: () => sync(null),
}));
vi.mock('../../src/components/ui', async (orig) => ({
  ...(await orig<typeof import('../../src/components/ui')>()),
  useCarregar: (fn: () => Promise<unknown> & { __sync?: unknown }) => { const p = fn(); return { dados: p.__sync, erro: null, aCarregar: false, recarregar: async () => {}, setDados: () => {} }; },
  useFiltros: () => ({ ano: 2026, setAno: () => {}, comunidade: 'todas', setComunidade: () => {} }),
}));

describe('Painel: com previsões ou só meses fechados', () => {
  it('por omissão: valores reais até hoje (resumos antigos sem meses reais: avisa para recalcular)', async () => {
    const { default: Painel } = await import('../../src/pages/Painel');
    const html = renderToString(<Painel />).replace(/<!-- -->/g, '');
    expect(html).toMatch(/<option value="reais" selected="">/);
    expect(html).toContain('Recalcular resumos');
    expect(html).toContain('3.000,00 €'); // sem mesesReais, usa os meses (jan + fev)
  });

  it('"Só meses fechados" deixa de fora os meses abertos', async () => {
    vi.stubGlobal('localStorage', { getItem: () => 'fechados', setItem: () => {} });
    vi.resetModules();
    const { default: Painel } = await import('../../src/pages/Painel');
    const html = renderToString(<Painel />).replace(/<!-- -->/g, '');
    vi.unstubAllGlobals();
    expect(html).toContain('1.000,00 €'); // só janeiro
    expect(html).not.toContain('3.000,00 €');
    expect(html).toContain('1 mês fechado');
  });

  it('componentes desligados saem das entradas e do saldo', async () => {
    vi.stubGlobal('localStorage', { getItem: (k: string) => (k === 'caf-portal:painel-componentes' ? JSON.stringify({ custosFixos: false }) : null), setItem: () => {} });
    vi.resetModules();
    const { default: Painel } = await import('../../src/pages/Painel');
    const html = renderToString(<Painel />).replace(/<!-- -->/g, '');
    vi.unstubAllGlobals();
    expect(html).toContain('Incluir');
    expect(html).not.toContain('Custos fixos anuais');
    expect(html).toContain('3.000,00 €'); // saldo = entradas sem custos fixos
  });
});
