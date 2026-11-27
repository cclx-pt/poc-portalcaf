import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
const sync = <T,>(v: T) => Object.assign(Promise.resolve(v), { __sync: v });
vi.mock('../../src/auth/AuthProvider', () => ({ useAuth: () => ({ acesso: { email: 'm@x.pt', papel: 'master', nivel: 'confidencial', comunidades: ['*'] }, pode: () => true, temNivel: () => true }) }));
vi.mock('../../src/firebase', () => ({ db: {} }));
vi.mock('../../src/lib/db', () => ({
  listarComunidades: () => sync([{ id: 'almada', nome: 'Almada', ordem: 1 }, { id: 'porto', nome: 'Porto', ordem: 2 }, { id: 'bolsa-geral', nome: 'Geral', ordem: 9, especial: true }]),
  listarLotes: () => sync([]),
  lerConfigAssistencia: () => sync({ eventoCelebracao: null }),
  listarCategorias: () => sync([{ id: 'c1', nome: '04.03 Eventos', codigo: '04.03', tipo: 'saida' }, { id: 'c2', nome: 'R1.01 Dízimos', codigo: 'R1.01', tipo: 'entrada' }]),
  listarDimensoes: () => sync([{ id: 'd1', tipo: 'centro', codigo: 'CC05', nome: 'Eventos' }]),
  listarCustosFixos: () => sync([]), gravar: async () => {}, auditar: async () => {},
}));
vi.mock('../../src/lib/pesos', async (orig) => ({
  ...(await orig<typeof import('../../src/lib/pesos')>()),
  listarPesos: () => sync([1, 2].map((mes) => ({ id: `2025-0${mes}`, ano: 2025, mes, metodo: 'media', pesos: mes === 1 ? { almada: 40, porto: 60 } : { almada: 45, porto: 55 }, proposta: { media: {}, mediana: {} }, manual: false, calculadoEm: '', gravadoPor: '', gravadoEm: '' }))),
}));
vi.mock('../../src/components/ui', async (orig) => ({
  ...(await orig<typeof import('../../src/components/ui')>()),
  useCarregar: (fn: () => Promise<unknown> & { __sync?: unknown }) => ({ dados: fn().__sync ?? { atual: [], antes: [], evento: null }, erro: null, aCarregar: false, recarregar: async () => {}, setDados: () => {} }),
  useFiltros: () => ({ ano: 2025, setAno: () => {}, comunidade: 'todas', setComunidade: () => {} }),
}));

describe('Ferramentas › Calculadora de distribuição (FER-01)', () => {
  it('reparte 1000 € pela média anual dos pesos (meses sem pesos e sem assistência ficam de fora)', async () => {
    const { default: Calculadora } = await import('../../src/pages/Calculadora');
    const html = renderToString(<MemoryRouter><Calculadora /></MemoryRouter>).replace(/<!-- -->/g, '');
    for (const t of ['Calculadora de distribuição', 'Média anual de 2025', 'Montante global a distribuir', 'Distribuição inicial', 'Distribuição manual', 'Diferença €', 'Por distribuir', 'Almada', '43%', '430,00 €', '57%', '570,00 €', '1.000,00 €']) expect(html).toContain(t);
    expect(html).not.toContain('<td>Geral</td>');
    expect(html).not.toMatch(/\d,\d+\s*%/);
  });
  it('com permissão de custos, mostra "Gravar como custos fixos" com os campos obrigatórios e só categorias de saída', async () => {
    const { default: Calculadora } = await import('../../src/pages/Calculadora');
    const html = renderToString(<MemoryRouter><Calculadora /></MemoryRouter>).replace(/<!-- -->/g, '');
    for (const t of ['Gravar como custos fixos', 'Nome *', 'Categoria *', 'Centro de custo *', 'Projeto ou evento', 'Fornecedor', 'Conta analítica', 'Ano *', 'De uma vez num mês', 'Dividido pelos 12 meses', '04.03 Eventos', 'CC05 Eventos', 'Gravar em Custos fixos', 'Vai gravar 2 linhas', 'Para gravar, falta: o nome, a categoria, o centro de custo']) expect(html).toContain(t);
    expect(html).not.toContain('R1.01 Dízimos');
  });
});
