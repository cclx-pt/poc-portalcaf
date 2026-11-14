import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import type { Lote } from '../../src/lib/types';

const sync = <T,>(v: T) => Object.assign(Promise.resolve(v), { __sync: v });
const lote = (origem: Lote['origem'], comunidadeId: string, mes: number, regs: Partial<Lote['registos'][number]>[]): Lote => ({
  id: `${origem}_${mes}_${comunidadeId}`, origem, ano: 2026, mes, periodo: `2026-${String(mes).padStart(2, '0')}`, comunidadeId,
  registos: regs.map((r, i) => ({ id: `${origem}-${mes}-${i}`, data: `2026-${String(mes).padStart(2, '0')}-0${i + 1}`, valor: 0, categoria: 'Dízimo', ...r })),
  total: 0, n: regs.length, atualizadoEm: '', atualizadoPor: '',
});
const LOTES: Record<string, Lote[]> = {
  contribuir: [lote('contribuir', 'almada', 3, [{ valor: 50, pessoaRef: 'Contribuinte #A1' }, { valor: 20, pessoaRef: 'Contribuinte #B2', categoria: 'Oferta' }]), lote('contribuir', 'bolsa-geral', 4, [{ valor: 100 }])],
  depositos: [lote('depositos', 'almada', 3, [{ valor: 230.5, categoria: 'Coletas em dinheiro' }])],
  assistencia: [
    lote('assistencia', 'almada', 3, [
      { data: '2026-03-01', valor: 120, evento: 'Culto', extra: { jump: 8, criancas: 20, connects: 5 } },
      { data: '2026-03-08', valor: 100, evento: 'Culto', extra: { jump: 6, criancas: 15 } },
      { data: '2026-03-07', valor: 999, evento: 'Retiro' }, // sábado: aparece na lista, não conta
    ]),
    lote('assistencia', 'porto', 4, [{ data: '2026-04-05', valor: 40, evento: 'Culto' }]),
  ],
};

vi.mock('../../src/auth/AuthProvider', () => ({ useAuth: () => ({ acesso: { email: 'm@x.pt', papel: 'master' }, pode: () => true, temNivel: () => true }) }));
const mesR = (m: number, x: Record<string, unknown> = {}) => ({
  mes: m, contribuir: 0, coletas: 0, transferencias: 0, quotaBolsa: 0, entradas: 0, custosFixos: 0, despesas: 0, saidas: 0, saldo: 0,
  adultosMedia: null, entradasPorCategoria: {}, despesasPorCategoria: {}, custosRubricas: {}, n: { contribuir: 0, coletas: 0, transferencias: 0, despesas: 0 },
  rubricas: { entrada: {}, saida: {} }, geralEntradas: 0, geralSaidas: 0, pesoGeral: null, adultosMedia12m: null, cedidoGeral: { entradas: 0, custosFixos: 0, despesas: 0 }, ...x,
});
const resumoR = (c: string, m3: Record<string, unknown>) => ({ id: `2026_${c}`, ano: 2026, comunidadeId: c, calculadoEm: '', calculadoPor: '', meses: Array.from({ length: 12 }, (_, i) => mesR(i + 1, i === 2 ? m3 : {})) });
const RESUMOS = [
  resumoR('almada', { entradas: 1000, saidas: 400, adultosMedia: 50, entradasPorCategoria: { Dízimos: 1000 }, rubricas: { entrada: { Dízimos: { local: 1000, geral: 0 } }, saida: { Instalações: { local: 100, geral: 200 }, 'Outros custos de funcionamento': { local: 100, geral: 0 } } } }),
  resumoR('porto', { entradas: 300, saidas: 500, adultosMedia: 0, rubricas: { entrada: { Ofertas: { local: 300, geral: 0 } }, saida: { Instalações: { local: 400, geral: 100 } } } }),
];

vi.mock('../../src/lib/db', () => ({
  listarResumos: () => sync(RESUMOS),
  listarCategorias: () => sync([]),
  listarLotes: (_a: unknown, origem: string) => sync(LOTES[origem] ?? []),
  listarComunidades: () => sync([{ id: 'almada', nome: 'Almada', ordem: 1 }, { id: 'porto', nome: 'Porto', ordem: 2 }]),
  lerEstadoSync: () => sync(null),
}));
vi.mock('../../src/components/ui', async (orig) => ({
  ...(await orig<typeof import('../../src/components/ui')>()),
  useCarregar: (fn: () => Promise<unknown> & { __sync?: unknown }) => { const p = fn(); return { dados: p.__sync, erro: null, aCarregar: false, recarregar: async () => {} }; },
  useFiltros: () => ({ ano: 2026, comunidade: 'todas' }),
}));

describe('páginas', () => {
  it('Assistência: mapa mensal em pessoas, sem €', async () => {
    const { default: Assistencia } = await import('../../src/pages/Assistencia');
    const html = renderToString(<Assistencia />);
    expect(html).toContain('Mapa mensal');
    expect(html).not.toContain('€');
    expect(html).toContain('>260<'); // total de jovens e adultos no ano (120+100+40)
    expect(html).toContain('>86,7<'); // média por registo (260/3)
    expect(html).toContain('>130,0<'); // média mensal (260/2 meses)
    expect(html).toContain('>314<'); // total de pessoas (149+121+40)
    expect(html).toContain('março');
    expect(html).toContain('>999<'); // na lista de registos
    expect(html).toContain('Só contam os registos de domingo');
    if (process.env.GUARDAR_HTML) (await import('node:fs')).writeFileSync('/tmp/smoke/assistencia.html', html);
  });
  it('Entradas: junta contribuições e depósitos', async () => {
    const { default: EntradasConjunto } = await import('../../src/pages/EntradasConjunto');
    const html = renderToString(<EntradasConjunto />);
    expect(html).toContain('400,50 €'); // 50 + 20 + 100 + 230,50
    expect(html).toContain('170,00 €'); // contribuições
    expect(html).toContain('230,50 €'); // depósitos
    expect(html).toContain('Bolsa geral (sem comunidade)');
    expect(html).toContain('Depósito de coletas');
    if (process.env.GUARDAR_HTML) (await import('node:fs')).writeFileSync('/tmp/smoke/entradas.html', html);
  });

  it('Demonstração de resultados: rubricas, total CCLX e resultado', async () => {
    const { default: DR } = await import('../../src/pages/DemonstracaoResultados');
    const html = renderToString(<DR />);
    expect(html).toContain('RESULTADO');
    expect(html).toContain('1.300,00 €'); // total de rendimentos CCLX
    expect(html).toContain('900,00 €'); // total de gastos CCLX
    expect(html).toContain('400,00 €'); // resultado CCLX
    expect(html).toContain('-200,00 €'); // resultado do Porto
    expect(html).not.toContain('Vencimentos e encargos</');
    if (process.env.GUARDAR_HTML) (await import('node:fs')).writeFileSync('/tmp/smoke/dr.html', html);
  });

  it('Comparação entre comunidades: indicadores e linha CCLX', async () => {
    const { default: Comparacao } = await import('../../src/pages/Comparacao');
    const html = renderToString(<Comparacao />);
    expect(html).toContain('Comparação entre comunidades');
    expect(html).toContain('>CCLX<');
    expect(html).toContain('250,0%'); // autossuficiência de Almada (1000 / 400)
    expect(html).toContain('20,00 €'); // entradas por pessoa em Almada (1000 / 50)
    expect(html).toContain('200,00 €'); // défice coberto no Porto
    expect(html).not.toContain('Infinity');
    expect(html).not.toContain('NaN');
    expect(html).toContain('-200 €'); // mapa de calor: resultado do Porto em março
    if (process.env.GUARDAR_HTML) (await import('node:fs')).writeFileSync('/tmp/smoke/comparacao.html', html);
  });
});
