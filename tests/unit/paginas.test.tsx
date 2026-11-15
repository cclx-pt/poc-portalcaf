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
      { data: '2026-03-14', valor: 80, evento: 'Culto com Batismos', extra: { criancas: 10 } },
      { data: '2026-03-21', valor: 60, evento: 'Conversões e decisões' },
    ]),
    lote('assistencia', 'porto', 4, [{ data: '2026-04-05', valor: 40, evento: 'Culto' }]),
  ],
};

vi.mock('../../src/auth/AuthProvider', () => ({ useAuth: () => ({ acesso: { email: 'm@x.pt', papel: 'master' }, pode: () => true, temNivel: () => true }) }));
const CONFIG_ASS: { atual: { eventoCelebracao: string | null } } = { atual: { eventoCelebracao: null } };
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
  listarResumos: (_a: unknown, ano: number) => sync(ano === 2026 ? RESUMOS : []),
  listarCustosFixos: () => sync([{ id: 'ss', comunidadeId: 'almada', rubrica: 'Segurança Social', valorMensal: 1, inicio: '2026-01', fim: null, nivel: 'privado', notas: 'Valor pendente de confirmação.' }]),
  lerConfigAssistencia: () => sync(CONFIG_ASS.atual),
  gravarConfigAssistencia: vi.fn(),
  listarExcecoes: () => sync([{ id: '2026-03-22_cclx', data: '2026-03-22', ambito: 'cclx', motivo: 'Culto conjunto', criadoPor: 'caf@x.pt', criadoEm: '' }]),
  gravarExcecao: vi.fn(), apagarExcecao: vi.fn(), auditar: vi.fn(),
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
    expect(html).toContain('Presenças por evento');
    expect(html).toContain('>999<'); // na lista de registos
    expect(html).toContain('Sem tipo de celebração escolhido');
    expect(html).toContain('Domingos sem registo');
    expect(html).toContain('15/03/2026'); // domingo em falta em Almada
    expect(html).not.toContain('22/03/2026 ·'); // exceção da CCLX: não está em falta
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
    expect(html).toContain('>1.300,00<'); // total de rendimentos CCLX (sem € nas células)
    expect(html).toContain('>900,00<'); // total de gastos CCLX
    expect(html).toContain('>400,00<'); // resultado CCLX
    expect(html).toContain('>(200,00)<'); // resultado do Porto, entre parênteses
    expect(html).toContain('Valores em euros');
    expect(html).toContain('total-geral'); // linha do resultado com regra dupla
    expect(html).not.toContain('Vencimentos e encargos</');
    if (process.env.GUARDAR_HTML) (await import('node:fs')).writeFileSync('/tmp/smoke/dr.html', html);
  });

  it('Comparação entre comunidades: indicadores e linha CCLX', async () => {
    const { default: Comparacao } = await import('../../src/pages/Comparacao');
    const html = renderToString(<Comparacao />);
    expect(html).toContain('Comparação entre comunidades');
    expect(html).toContain('>CCLX<');
    expect(html).toContain('250,0%'); // autossuficiência de Almada (1000 / 400)
    expect(html).toContain('>20,00<'); // entradas por pessoa em Almada (1000 / 50), € no cabeçalho
    expect(html).toContain('>200,00<'); // défice coberto no Porto
    expect(html).toContain('(€)');
    expect(html).not.toContain('Infinity');
    expect(html).not.toContain('NaN');
    expect(html).toContain('−200 €'); // mapa de calor: resultado do Porto em março
    if (process.env.GUARDAR_HTML) (await import('node:fs')).writeFileSync('/tmp/smoke/comparacao.html', html);
  });

  it('Relatório custos x entradas: resumo, tabelas e notas', async () => {
    const { default: Relatorio } = await import('../../src/pages/Relatorio');
    const html = renderToString(<Relatorio />);
    expect(html).toContain('RELATÓRIO FINANCEIRO · CCLX');
    expect(html).toContain('Custos x entradas e assistência');
    expect(html).toContain('Resumo anual');
    expect(html).toContain('Mês a mês');
    expect(html).toContain('Pendente de confirmação');
    expect(html).toContain('1.300,00 €'); // entradas do ano (indicador, com €)
    expect(html).toContain('Entradas (€)'); // tabela mês a mês: € no cabeçalho
    expect(html).not.toContain('NaN');
    expect(html).not.toContain('Infinity');
    expect(html).not.toContain('Vencimentos e encargos');
    if (process.env.GUARDAR_HTML) (await import('node:fs')).writeFileSync('/tmp/smoke/relatorio.html', html);
  });

  it('Assistência com tipo de celebração configurado: filtro por defeito e o que conta', async () => {
    CONFIG_ASS.atual = { eventoCelebracao: 'Culto' };
    const { default: Assistencia } = await import('../../src/pages/Assistencia');
    const html = renderToString(<Assistencia />);
    CONFIG_ASS.atual = { eventoCelebracao: null };
    expect(html).toContain('<option value="Culto" selected="">Culto</option>');
    expect(html).toContain('"Culto"'); // nota: o tipo que conta para as médias
    expect(html).toContain('>260<'); // só registos Culto
    expect(html).not.toContain('>999<'); // Retiro fora do filtro
  });

  it('Batismos: só eventos de batismo, com nota da fase seguinte', async () => {
    const { default: RegistoEvento } = await import('../../src/pages/RegistoEvento');
    const html = renderToString(<RegistoEvento registo="batismos" />);
    expect(html).toContain('Batismos');
    expect(html).toContain('Culto com Batismos');
    expect(html).not.toContain('Retiro');
    expect(html).not.toContain('Conversões e decisões');
    expect(html).toContain('fase seguinte');
    expect(html).not.toContain('€');
  });
  it('Conversões: só eventos de conversões/decisões', async () => {
    const { default: RegistoEvento } = await import('../../src/pages/RegistoEvento');
    const html = renderToString(<RegistoEvento registo="conversoes" />);
    expect(html).toContain('Conversões e decisões');
    expect(html).not.toContain('Culto com Batismos');
  });
});
