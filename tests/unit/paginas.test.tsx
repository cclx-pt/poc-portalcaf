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

const MASTER_ACESSO = { email: 'm@x.pt', papel: 'master', nivel: 'confidencial', comunidades: ['*'] };
const AUTH: { atual: Record<string, unknown> } = { atual: { acesso: MASTER_ACESSO, pode: () => true, temNivel: () => true } };
vi.mock('../../src/auth/AuthProvider', () => ({ useAuth: () => AUTH.atual }));
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
  lerLote: () => sync(null), gravarLote: vi.fn(),
  gravarConfigAssistencia: vi.fn(),
  listarExcecoes: () => sync([{ id: '2026-03-22_cclx', data: '2026-03-22', ambito: 'cclx', motivo: 'Culto conjunto', criadoPor: 'caf@x.pt', criadoEm: '' }]),
  gravarExcecao: vi.fn(), apagarExcecao: vi.fn(), auditar: vi.fn(),
  listarCategorias: () => sync([]),
  listarLotes: (_a: unknown, origem: string) => sync(LOTES[origem] ?? []),
  listarComunidades: () => sync([{ id: 'almada', nome: 'Almada', ordem: 1 }, { id: 'porto', nome: 'Porto', ordem: 2 }]),
  lerEstadoSync: () => sync(null),
  listarContas: () => sync([{ id: 'cgd-principal', nome: 'CGD · Conta principal', banco: 'Caixa Geral de Depósitos', tipo: 'principal' }, { id: 'santander', nome: 'Santander', banco: 'Santander', tipo: 'corrente' }]),
  listarBanco: () => sync([
    { id: 'cgd-principal_2026_11', contaId: 'cgd-principal', ano: 2026, mes: 11, periodo: '2026-11', atualizadoEm: '', atualizadoPor: '', registos: [
      { id: 'c1', data: '2026-11-02', descricao: 'TRF MBWAY', valor: 100, saldo: 1100, ordem: 0, contabilizar: false },
      { id: 'c2', data: '2026-11-05', descricao: 'CCLX ALMADA', valor: -50, saldo: 1050, ordem: 1, contabilizar: false, estorno: true },
    ] },
    { id: 'santander_2026_11', contaId: 'santander', ano: 2026, mes: 11, periodo: '2026-11', atualizadoEm: '', atualizadoPor: '', registos: [
      { id: 's1', data: '2026-11-03', descricao: 'Garagem Almada', valor: -80, saldo: 420, ordem: 0, contabilizar: false },
    ] },
  ]),
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
    expect(html).toContain('>Calcular<');
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
    expect(html).toContain('Geral (sem comunidade)');
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

  it('Batismos e Conversões: em desenvolvimento, sem dados', async () => {
    const { default: RegistoEvento } = await import('../../src/pages/RegistoEvento');
    const b = renderToString(<RegistoEvento registo="batismos" />);
    expect(b).toContain('Batismos');
    expect(b).toContain('Em desenvolvimento');
    expect(b).not.toContain('Culto com Batismos');
    const c = renderToString(<RegistoEvento registo="conversoes" />);
    expect(c).toContain('Conversões');
    expect(c).toContain('Em desenvolvimento');
  });

  it('Registar presenças: os campos do formulário Jotform', async () => {
    CONFIG_ASS.atual = { eventoCelebracao: 'Celebração Domingo', eventos: ['Celebração Domingo', 'Reunião Oração', 'ATOS', 'Outra'] } as never;
    const { default: RegistarPresencas } = await import('../../src/pages/RegistarPresencas');
    const html = renderToString(<RegistarPresencas />);
    CONFIG_ASS.atual = { eventoCelebracao: null };
    // (a celebração só aparece se hoje for domingo: os eventos filtram-se pelo dia da semana da data)
    for (const t of ['Data do evento', 'Evento', 'Comunidade', 'Jovens e adultos', 'Jump (12-14)', 'Crianças (3-11)', 'Connect&#x27;s', 'Observações', 'Reunião Oração', 'ATOS', 'Outra', 'Almada', 'Porto']) expect(html).toContain(t);
    expect(html).toContain('>Guardar registo<');
    expect(html).not.toMatch(/type="number"[^>]*value="0"/);
    expect(html).toContain('placeholder="dd/mm/aaaa"');
    expect(html).not.toContain('€');
    if (process.env.GUARDAR_HTML) (await import('node:fs')).writeFileSync('/tmp/smoke/registar.html', html);
  });

  it('Registar presenças: só as comunidades a que o utilizador tem acesso', async () => {
    AUTH.atual = { acesso: { email: 'r@x.pt', papel: 'registos', nivel: 'publico', comunidades: ['porto'] }, pode: (a: string) => a === 'registar', temNivel: () => false, sair: vi.fn() };
    const { default: RegistarPresencas } = await import('../../src/pages/RegistarPresencas');
    const html = renderToString(<RegistarPresencas />);
    AUTH.atual = { acesso: MASTER_ACESSO, pode: () => true, temNivel: () => true };
    expect(html).toContain('Porto');
    expect(html).not.toContain('Almada');
  });

  it('Link direto /registar: separadores Novo registo e Consultar, sem dados financeiros', async () => {
    AUTH.atual = { acesso: { email: 'r@x.pt', papel: 'registos', nivel: 'publico', comunidades: ['porto'] }, pode: (a: string) => a === 'registar', temNivel: () => false, sair: vi.fn() };
    const { default: RegistoRapido } = await import('../../src/pages/RegistoRapido');
    const html = renderToString(<RegistoRapido />);
    AUTH.atual = { acesso: MASTER_ACESSO, pode: () => true, temNivel: () => true };
    for (const t of ['Novo registo', 'Consultar', 'Registo de presenças', 'r@x.pt', 'Sair', 'Guardar registo', 'Porto']) expect(html).toContain(t);
    for (const t of ['Almada', '€', 'Entradas', 'Painel']) expect(html).not.toContain(t);
    if (process.env.GUARDAR_HTML) (await import('node:fs')).writeFileSync('/tmp/smoke/registo-rapido.html', html);
  });

  it('Lista de presenças: Corrigir em cada registo e última alteração com quem', async () => {
    const { ListaPresencas } = await import('../../src/pages/RegistarPresencas');
    const l = lote('assistencia', 'almada', 11, [
      { data: '2026-11-08', valor: 105, evento: 'Celebração Domingo', extra: { alteradoPor: 'ana@x.pt', alteradoEm: '2026-11-17T14:05:00.000Z' } },
      { data: '2026-11-15', valor: 90, evento: 'Celebração Domingo' },
    ]);
    const html = renderToString(<ListaPresencas lotes={[l]} comunidades={[{ id: 'almada', nome: 'Almada', ordem: 1 }]} soPortal={false} aposApagar={async () => {}} />);
    expect(html).toContain('Última alteração');
    expect(html).toMatch(/17\/11\/2026 \d{2}:05 · ana@x\.pt/);
    expect(html.match(/>Corrigir</g)?.length).toBe(2);
  });

  it('Domingos em falta (telemóvel): por comunidade do utilizador, a tocar abre o registo', async () => {
    const { DomingosEmFaltaLista } = await import('../../src/pages/RegistarPresencas');
    const html = renderToString(<DomingosEmFaltaLista ano={2026} hoje="2026-03-22" comunidades={[{ id: 'almada', nome: 'Almada', ordem: 1 }]} lotes={LOTES.assistencia} aoEscolher={() => {}} />);
    expect(html).toContain('Domingos em falta');
    expect(html).toContain('Almada');
    expect(html).not.toContain('Porto');
    // Almada tem registos a 01, 08, 14(sáb.) e 21/03 (sáb.)... os domingos sem registo de jan e fev aparecem
    expect(html).toContain('04/01/2026');
    expect(html).not.toContain('01/03/2026');
    expect(html).toContain('Registar');
    if (process.env.GUARDAR_HTML) (await import('node:fs')).writeFileSync('/tmp/smoke/domingos-falta.html', html);
  });

  it('Popup de sucesso com o resumo do registo', async () => {
    const { ResumoRegistoGuardado } = await import('../../src/pages/RegistarPresencas');
    const html = renderToString(<ResumoRegistoGuardado entrada={{ data: '2026-11-15', evento: 'Celebração Domingo', comunidadeId: 'almada', adultos: 120, jump: 8, criancas: 20, connects: 0, observacoes: 'Visitas' }} comunidade="Almada" aoFechar={() => {}} />);
    for (const t of ['Registo guardado com sucesso', '15/11/2026', 'Celebração Domingo', 'Almada', '120', 'Jump (12-14)', 'Visitas', 'Novo registo']) expect(html).toContain(t);
    if (process.env.GUARDAR_HTML) (await import('node:fs')).writeFileSync('/tmp/smoke/popup.html', html);
  });

  it('Campo de data: escreve-se em dd/mm/aaaa e tem botão de calendário', async () => {
    const { CampoData } = await import('../../src/components/ui');
    const html = renderToString(<CampoData rotulo="Data do evento" valor="2026-11-15" max="2026-11-17" onChange={() => {}} />);
    expect(html).toContain('value="15/11/2026"');
    expect(html).toContain('aria-label="Abrir calendário"');
    expect(html).toMatch(/type="date"[^>]*max="2026-11-17"/);
  });

  it('Formulário: mostra a descrição, quando ocorre e só as contagens do evento escolhido', async () => {
    CONFIG_ASS.atual = { eventoCelebracao: 'Celebração Domingo', contagens: [{ id: 'online', nome: 'Online' }], eventosConfig: [
      { id: 'celebracao-domingo', nome: 'Celebração Domingo', ativo: true, contagens: ['adultos', 'jump', 'criancas', 'connects'], dias: [0], horario: { diaTodo: false, inicio: '10:30', fim: '12:30' } },
      { id: 'reuniao-oracao', nome: 'Reunião Oração', descricao: 'Oração semanal da comunidade', ativo: true, contagens: ['adultos', 'online'], dias: [2], horario: { diaTodo: false, inicio: '21:00' } },
    ] } as never;
    const { FormularioPresencas } = await import('../../src/pages/RegistarPresencas');
    const html = renderToString(<FormularioPresencas comunidades={[{ id: 'almada', nome: 'Almada', ordem: 1 }]} lotes={[]} aposGravar={async () => {}} inicial={{ data: '2026-11-17', evento: 'Reunião Oração' }} />);
    CONFIG_ASS.atual = { eventoCelebracao: null };
    expect(html).toContain('Oração semanal da comunidade');
    expect(html).toContain('Terça · 21:00');
    expect(html).toContain('Online *');
    expect(html).toContain('Jovens e adultos *');
    expect(html).not.toContain('Jump (12-14) *');
    expect(html).not.toContain('>Celebração Domingo<'); // não ocorre à terça
  });

  it('Configuração de eventos: lista com quando ocorre e o que recolhe', async () => {
    CONFIG_ASS.atual = { eventoCelebracao: 'Celebração Domingo', eventos: ['Celebração Domingo', 'Reunião Oração', 'Outra'] } as never;
    const { default: ConfigEventos } = await import('../../src/pages/ConfigEventos');
    const html = renderToString(<ConfigEventos />);
    CONFIG_ASS.atual = { eventoCelebracao: null };
    for (const t of ['Eventos do registo de presenças', 'Celebração Domingo', 'Domingo · dia todo', 'Qualquer dia · dia todo', 'Jovens e adultos, Jump (12-14), Crianças (3-11), Connect', 'Novo evento', 'Contagens', 'Editar']) expect(html).toContain(t);
    if (process.env.GUARDAR_HTML) (await import('node:fs')).writeFileSync('/tmp/smoke/config-eventos.html', html);
  });

  it('Contador (grelha de toque): um quadrado por contagem, − no canto, total e rever e guardar', async () => {
    const { Contador } = await import('../../src/pages/Contador');
    const html = renderToString(<Contador contagens={[{ id: 'adultos', nome: 'Jovens e adultos' }, { id: 'criancas', nome: 'Crianças (3-11)' }]} valores={{ adultos: 37, criancas: 12 }} contexto="15/11/2026 · Celebração Domingo · Almada" guardadoEm="2026-11-15T10:42:00.000Z" aoSomar={() => {}} aoFechar={() => {}} />);
    for (const t of ['Jovens e adultos', '>37<', 'Crianças (3-11)', '>12<', 'Total', '>49<', 'toque para +1', 'Mais 1 em Crianças (3-11)', 'Menos 1 em Crianças (3-11)', 'Rever e guardar registo', 'Celebração Domingo', 'Rascunho guardado às']) expect(html).toContain(t);
    if (process.env.GUARDAR_HTML) (await import('node:fs')).writeFileSync('/tmp/smoke/contador.html', html);
  });

  it('Formulário: botão Abrir contador', async () => {
    const { FormularioPresencas } = await import('../../src/pages/RegistarPresencas');
    const html = renderToString(<FormularioPresencas comunidades={[{ id: 'almada', nome: 'Almada', ordem: 1 }]} lotes={[]} aposGravar={async () => {}} />);
    expect(html).toContain('Abrir contador');
  });


  it('Custos fixos: incidência, valor imputado, âmbito e importação do Excel', async () => {
    const { default: CustosFixos } = await import('../../src/pages/CustosFixos');
    const html = renderToString(<CustosFixos />);
    for (const t of ['Incidência', 'Imputado', 'Importar do Excel', '01/2026']) expect(html).toContain(t);
  });

  it('Bancos: vista conjunta do mês com logótipo por linha, filtros por banco e totais', async () => {
    const { default: Bancos } = await import('../../src/pages/Bancos');
    const html = renderToString(<Bancos />);
    expect(html.match(/src="\/bancos\/(cgd|santander)\.png"/g)?.length).toBeGreaterThanOrEqual(5); // 2 filtros + 2 cartões + 3 linhas
    for (const t of ['Novembro 2026', 'Limpar extrato', 'Importar extrato', 'Total dos bancos visíveis', 'Estorno', 'TRF MBWAY', 'Garagem Almada']) expect(html).toContain(t);
    expect(html).toContain('1.470,00 €'); // saldo final CGD 1.050 + Santander 420
    if (process.env.GUARDAR_HTML) (await import('node:fs')).writeFileSync('/tmp/smoke/bancos.html', html);
  });

  it('Bancos, vista de saldos: cartões, verificação, saldos mensais e exportação', async () => {
    const { default: SaldosBancos } = await import('../../src/pages/SaldosBancos');
    const contas = [{ id: 'cgd-principal', nome: 'CGD · Conta principal', banco: 'Caixa Geral de Depósitos', tipo: 'principal' as const }, { id: 'santander', nome: 'Santander', banco: 'Santander', tipo: 'corrente' as const }];
    const mv = (id: string, data: string, valor: number, saldo: number, ordem: number) => ({ id, data, descricao: id, valor, saldo, ordem, contabilizar: false });
    const lotes = [
      { id: 'c10', contaId: 'cgd-principal', ano: 2026, mes: 10, periodo: '2026-10', atualizadoEm: '', atualizadoPor: '', registos: [mv('a', '2026-10-02', 100, 1100, 0)] },
      { id: 'c11', contaId: 'cgd-principal', ano: 2026, mes: 11, periodo: '2026-11', atualizadoEm: '', atualizadoPor: '', registos: [mv('b', '2026-11-02', -100, 1000, 0)] },
      { id: 's11', contaId: 'santander', ano: 2026, mes: 11, periodo: '2026-11', atualizadoEm: '', atualizadoPor: '', registos: [mv('c', '2026-11-03', 50, 450, 0)] },
    ];
    const html = renderToString(<SaldosBancos contas={contas} lotes={lotes} ano={2026} aoAbrirMes={() => {}} />);
    for (const t of ['Saldo atual', '1.450,00 €', 'Saldo médio', 'Mês com mais saídas', 'Verificação dos extratos', 'Saldos mensais', 'Exportar para Excel', 'Ver mês', 'Sem extrato']) expect(html).toContain(t);
    if (process.env.GUARDAR_HTML) (await import('node:fs')).writeFileSync('/tmp/smoke/saldos.html', html);
  });
});

