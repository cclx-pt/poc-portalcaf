import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import type { Lote } from '../../src/lib/types';
const sync = <T,>(v: T) => Object.assign(Promise.resolve(v), { __sync: v });
vi.mock('../../src/auth/AuthProvider', () => ({ useAuth: () => ({ acesso: { email: 'm@x.pt', papel: 'master', nivel: 'confidencial', comunidades: ['*'] }, pode: () => true, temNivel: () => true }) }));
vi.mock('../../src/firebase', () => ({ db: {} }));
vi.mock('../../src/lib/recalcular', () => ({ recalcularAno: async () => {} }));
const dom = (m: number) => `2026-${String(m).padStart(2, '0')}-0${[4, 1, 1][m - 1]}`; // domingos de jan, fev, mar 2026
const lote = (c: string, m: number, v: number): Lote => ({ id: `a_${c}_${m}`, origem: 'assistencia', ano: 2026, mes: m, periodo: `2026-0${m}`, comunidadeId: c, registos: [{ id: `${c}${m}`, data: dom(m), valor: v, categoria: 'x' }], total: v, n: 1, atualizadoEm: '', atualizadoPor: '' });
vi.mock('../../src/lib/db', () => ({
  listarComunidades: () => sync([{ id: 'almada', nome: 'Almada', ordem: 1 }, { id: 'porto', nome: 'Porto', ordem: 2 }, { id: 'bolsa-geral', nome: 'Geral', ordem: 9, especial: true }]),
  listarLotes: (_a: unknown, _o: string, ano: number) => sync(ano === 2026 ? [lote('almada', 1, 100), lote('almada', 2, 100), lote('almada', 3, 400), lote('porto', 1, 100), lote('porto', 2, 100), lote('porto', 3, 100)] : []),
  lerConfigAssistencia: () => sync({ eventoCelebracao: null }),
  auditar: async () => {},
}));
vi.mock('../../src/lib/pesos', async (orig) => ({
  ...(await orig<typeof import('../../src/lib/pesos')>()),
  listarPesos: () => sync([{ id: '2026-02', ano: 2026, mes: 2, metodo: 'mediana', pesos: { almada: 40, porto: 60 }, proposta: { media: {}, mediana: {} }, manual: true, calculadoEm: '', gravadoPor: 'm@x.pt', gravadoEm: '2026-11-25T10:00:00Z' }]),
}));
vi.mock('../../src/components/ui', async (orig) => ({
  ...(await orig<typeof import('../../src/components/ui')>()),
  useCarregar: (fn: () => Promise<unknown> & { __sync?: unknown }) => { const p = fn(); return { dados: p.__sync ?? (p as unknown as { __sync: unknown }).__sync, erro: null, aCarregar: false, recarregar: async () => {}, setDados: () => {} }; },
  useFiltros: () => ({ ano: 2026, setAno: () => {}, comunidade: 'todas', setComunidade: () => {} }),
}));

describe('Administração › Peso das comunidades (ADM-05)', () => {
  it('mostra os pesos gravados por mês e a simulação pela média e pela mediana', async () => {
    const { default: Pesos } = await import('../../src/pages/Pesos');
    const html = renderToString(<MemoryRouter><Pesos /></MemoryRouter>).replace(/<!-- -->/g, '');
    for (const t of ['Peso das comunidades 2026', 'Recalcular pesos de assistência', 'Recalcular dados e distribuições', 'Média 12m', 'Mediana 12m', 'Usar a média', 'Usar a mediana', 'À mão', '40%', 'Pessoas']) expect(html).toContain(t);
  });
});
