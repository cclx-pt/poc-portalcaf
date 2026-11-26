import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SyncEmCurso, fundirLote, marcadorMaisRecente, recuar, sincronizar, type ArmazemSync, type EstadoSync } from '../../src/lib/sync';
import { JOTFORM_FORMS } from '../../src/lib/seed';
import type { Lote } from '../../src/lib/types';

/** Jotform falso: devolve as submissões criadas depois do filtro created_at:gt. */
type Sub = { id: string; created_at: string; comunidade: string; valor: string; nome: string; pago?: string };
function jotformFalso(subs: Record<string, Sub[]>) {
  const chamadas: { form: string; desde: string }[] = [];
  const fetchFalso = vi.fn(async (url: string) => {
    const u = new URL(url);
    const form = u.pathname.split('/')[2];
    const desde = JSON.parse(u.searchParams.get('filter')!)['created_at:gt'];
    chamadas.push({ form, desde });
    const lista = (subs[form] ?? []).filter((s) => s.created_at > desde).map((s) => ({
      id: s.id, created_at: s.created_at, status: 'ACTIVE',
      answers: {
        '1': { text: 'Nome ', type: 'control_textbox', answer: s.nome },
        '2': { text: 'Comunidade', type: 'control_dropdown', answer: s.comunidade },
        '3': { text: 'Valor (€)', type: 'control_number', answer: s.valor },
        '4': { text: 'Categoria', type: 'control_dropdown', answer: 'Dízimo' },
        '5': { text: '', name: 'PAGO', type: 'control_hidden', answer: s.pago ?? 'PAGO' },
      },
    }));
    return { ok: true, status: 200, json: async () => ({ responseCode: 200, content: lista }) } as Response;
  });
  return { fetchFalso, chamadas };
}

/** Base de dados em memória. */
function armazemMemoria(fechados: string[] = []) {
  const cols: Record<string, Map<string, Lote>> = { lotes: new Map(), lotes_conf: new Map() };
  let estado: EstadoSync | null = null;
  const recalculados: number[] = [];
  const arm: ArmazemSync = {
    lerEstado: async () => (estado ? structuredClone(estado) : null),
    marcarEmCurso: async (v) => { estado = { ...(estado ?? ({} as EstadoSync)), emCurso: v }; },
    gravarEstado: async (e) => { estado = structuredClone(e); },
    mesesFechados: async () => new Set(fechados),
    lerLotes: async (col, ids) => new Map(ids.filter((i) => cols[col].has(i)).map((i) => [i, structuredClone(cols[col].get(i)!)])),
    listarIdsLotes: async (origem) => [...cols.lotes.values()].filter((l) => l.origem === origem).map((l) => ({ id: l.id, periodo: l.periodo })),
    gravarLotes: async (ops) => { for (const o of ops) { if (o.apagar) cols[o.col].delete(o.id); else cols[o.col].set(o.id, structuredClone(o.lote!)); } },
    recalcular: async (ano) => { recalculados.push(ano); },
    auditar: async () => {},
  };
  return { arm, cols, recalculados, estado: () => estado };
}

const CFG = { apiKey: 'k', base: 'https://eu-api.jotform.com' };
const F = JOTFORM_FORMS.contribuir.id;

describe('sincronização incremental', () => {
  beforeEach(() => vi.useRealTimers());
  afterEach(() => vi.unstubAllGlobals());

  it('funde lotes sem duplicar registos', () => {
    const base: Lote = { id: 'x', origem: 'contribuir', ano: 2026, mes: 3, periodo: '2026-03', comunidadeId: 'almada', registos: [{ id: '1', data: '2026-03-01', valor: 10, categoria: 'D' }], total: 10, n: 1, atualizadoEm: 'a', atualizadoPor: 'a' };
    const novo: Lote = { ...base, registos: [{ id: '1', data: '2026-03-01', valor: 99, categoria: 'D' }, { id: '2', data: '2026-03-05', valor: 5, categoria: 'D' }], atualizadoEm: 'b' };
    const r = fundirLote(base, novo);
    expect(r.acrescentados).toBe(1);
    expect(r.lote.registos.map((x) => x.valor)).toEqual([10, 5]); // o existente não é reescrito
    expect(r.lote.total).toBe(15);
    expect(r.lote.n).toBe(2);
    expect(fundirLote(r.lote, novo).acrescentados).toBe(0);
  });

  it('guarda o marcador da submissão mais recente', () => {
    expect(marcadorMaisRecente([{ 'Submission Date': '2026-03-02 10:00:00' }, { 'Submission Date': '2026-03-09 08:00:00' }], '2026-01-01 00:00:00')).toBe('2026-03-09 08:00:00');
    expect(marcadorMaisRecente([], '2026-01-01 00:00:00')).toBe('2026-01-01 00:00:00');
  });

  it('1.ª vez lê tudo; depois só pede e integra as submissões novas', async () => {
    const subs = { [F]: [
      { id: 'a', created_at: '2026-03-02 10:00:00', comunidade: 'Almada', valor: '50', nome: 'Ana' },
      { id: 'b', created_at: '2026-03-09 10:00:00', comunidade: 'Almada', valor: '20', nome: 'Rui' },
    ] };
    const j = jotformFalso(subs);
    vi.stubGlobal('fetch', j.fetchFalso);
    const m = armazemMemoria();

    const e1 = await sincronizar(m.arm, CFG, 'teste');
    expect(e1.ok).toBe(true);
    expect(e1.resultado.contribuir.novos).toBe(2);
    expect(e1.marcadores?.contribuir).toBe('2026-03-09 10:00:00');
    expect(j.chamadas.find((c) => c.form === F)!.desde).toBe('2025-01-01 00:00:00');
    expect(m.recalculados).toEqual([2026]);
    expect(m.cols.lotes.get('contribuir_2026_03_almada')!.n).toBe(2);
    expect(m.cols.lotes_conf.get('contribuir_2026_03_almada')!.registos[0].pessoa).toBe('Ana');

    // Sem novidades: não escreve nem recalcula.
    j.chamadas.length = 0; m.recalculados.length = 0;
    const e2 = await sincronizar(m.arm, CFG, 'teste');
    expect(j.chamadas.find((c) => c.form === F)!.desde).toBe('2026-02-07 10:00:00'); // relê 30 dias
    expect(e2.resultado.contribuir.novos).toBe(0);
    expect(m.recalculados).toEqual([]);

    // Uma submissão nova: só essa é acrescentada.
    subs[F].push({ id: 'c', created_at: '2026-03-20 12:00:00', comunidade: 'Almada', valor: '5', nome: 'Eva' });
    const e3 = await sincronizar(m.arm, CFG, 'teste');
    expect(e3.resultado.contribuir.novos).toBe(1);
    const l = m.cols.lotes.get('contribuir_2026_03_almada')!;
    expect(l.n).toBe(3);
    expect(l.total).toBe(75);
    expect(new Set(l.registos.map((r) => r.id)).size).toBe(3);
    expect(m.estado()?.emCurso).toBeNull();
  });

  it('recua o marcador', () => {
    expect(recuar('2026-03-09 10:00:00', 30)).toBe('2026-02-07 10:00:00');
  });

  it('só integra contribuições pagas; uma que passa a PAGO depois entra na sincronização seguinte', async () => {
    const subs: Record<string, Sub[]> = { [F]: [
      { id: 'a', created_at: '2026-03-02 10:00:00', comunidade: 'Almada', valor: '50', nome: 'Ana', pago: 'PAGO' },
      { id: 'b', created_at: '2026-03-03 10:00:00', comunidade: 'Almada', valor: '20', nome: 'Rui', pago: 'PENDENTE' },
    ] };
    vi.stubGlobal('fetch', jotformFalso(subs).fetchFalso);
    const m = armazemMemoria();
    const e1 = await sincronizar(m.arm, CFG, 'teste');
    expect(e1.resultado.contribuir.novos).toBe(1);
    expect(e1.resultado.contribuir.naoPagas).toBe(1);
    expect(m.cols.lotes.get('contribuir_2026_03_almada')!.total).toBe(50);

    subs[F][1].pago = 'PAGO'; // pagamento confirmado mais tarde (sem nova submissão)
    const e2 = await sincronizar(m.arm, CFG, 'teste');
    expect(e2.resultado.contribuir.novos).toBe(1);
    expect(m.cols.lotes.get('contribuir_2026_03_almada')!.total).toBe(70);
  });

  it('sem o campo PAGO não integra nada e dá erro', async () => {
    const semPago = vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => ({ responseCode: 200, content: !url.includes(F) ? [] : [
      { id: 'a', created_at: '2026-03-02 10:00:00', status: 'ACTIVE', answers: { '2': { text: 'Comunidade', answer: 'Almada' }, '3': { text: 'Valor (€)', answer: '50' } } },
    ] }) }) as Response);
    vi.stubGlobal('fetch', semPago);
    const m = armazemMemoria();
    const e = await sincronizar(m.arm, CFG, 'teste');
    expect(e.ok).toBe(false);
    expect(e.erros.join()).toMatch(/contribuir: .*Pago/);
    expect([...m.cols.lotes.keys()].filter((k) => k.startsWith('contribuir'))).toEqual([]);
  });

  it('reler tudo (completo) retira contribuições por pagar que já tinham entrado', async () => {
    const subs: Record<string, Sub[]> = { [F]: [
      { id: 'pago', created_at: '2026-07-14 13:48:46', comunidade: 'Porto', valor: '1', nome: '', pago: 'PAGO' },
      { id: 'teste', created_at: '2026-07-14 13:33:17', comunidade: 'Porto', valor: '5000', nome: '', pago: '' },
    ] };
    vi.stubGlobal('fetch', jotformFalso(subs).fetchFalso);
    const m = armazemMemoria();
    // Estado antes da regra PAGO: os dois registos já estavam integrados.
    const antigo: Lote = { id: 'contribuir_2026_07_porto', origem: 'contribuir', ano: 2026, mes: 7, periodo: '2026-07', comunidadeId: 'porto',
      registos: [{ id: 'pago', data: '2026-07-14', valor: 1, categoria: 'Obras' }, { id: 'teste', data: '2026-07-14', valor: 5000, categoria: 'Obras' }],
      total: 5001, n: 2, atualizadoEm: '', atualizadoPor: '' };
    await m.arm.gravarLotes([{ col: 'lotes', id: antigo.id, lote: antigo }, { col: 'lotes_conf', id: antigo.id, lote: antigo }]);

    const inc = await sincronizar(m.arm, CFG, 'teste'); // incremental não limpa
    expect(m.cols.lotes.get(antigo.id)!.total).toBe(5001);
    expect(inc.resultado.contribuir.naoPagas).toBe(1);

    const e = await sincronizar(m.arm, CFG, 'teste', { modo: 'completo' });
    expect(e.modo).toBe('completo');
    expect(m.cols.lotes.get(antigo.id)!.total).toBe(1);
    expect(m.cols.lotes_conf.get(antigo.id)!.registos.map((r) => r.id)).toEqual(['pago']);
    expect(e.resultado.contribuir.naoPagas).toBe(1);
  });

  it('reler tudo usa a data de referência pedida', async () => {
    const subs: Record<string, Sub[]> = { [F]: [
      { id: 'velho', created_at: '2016-05-01 10:00:00', comunidade: 'Almada', valor: '10', nome: 'Ana', pago: 'PAGO' },
      { id: 'novo', created_at: '2026-03-01 10:00:00', comunidade: 'Almada', valor: '20', nome: 'Rui', pago: 'PAGO' },
    ] };
    const j = jotformFalso(subs);
    vi.stubGlobal('fetch', j.fetchFalso);
    const m = armazemMemoria();
    const e = await sincronizar(m.arm, CFG, 'teste', { modo: 'completo', desde: '2015-01-01' });
    expect(j.chamadas.find((c) => c.form === F)!.desde).toBe('2015-01-01 00:00:00');
    expect(e.resultado.contribuir.registos).toBe(2); // o registo de 2016 também entra
    expect([...m.cols.lotes.keys()].some((k) => k.includes('2016'))).toBe(true);
  });

  it('reler tudo preserva os registos de presenças feitos no portal', async () => {
    const A = JOTFORM_FORMS.assistencia.id;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => ({ responseCode: 200, content: !url.includes(A) ? [] : [
      { id: 'j1', created_at: '2026-11-08 12:00:00', status: 'ACTIVE', answers: { '1': { text: 'Dia', type: 'control_datetime', answer: { day: '08', month: '11', year: '2026' } }, '2': { text: 'Comunidade', answer: 'Almada' }, '3': { text: 'Jovens e Adultos', answer: '100' }, '4': { text: 'Evento', answer: 'Celebração Domingo' } } },
    ] }) }) as Response));
    const m = armazemMemoria();
    // Registo feito no portal, no mesmo lote mensal.
    const doPortal: Lote = { id: 'assistencia_2026_11_almada', origem: 'assistencia', ano: 2026, mes: 11, periodo: '2026-11', comunidadeId: 'almada',
      registos: [{ id: 'portal-2026-11-15-x', data: '2026-11-15', valor: 120, categoria: 'Assistência', evento: 'Celebração Domingo' }], total: 120, n: 1, atualizadoEm: '', atualizadoPor: 'ana@x.pt' };
    const soPortal: Lote = { ...doPortal, id: 'assistencia_2026_10_porto', mes: 10, periodo: '2026-10', comunidadeId: 'porto', registos: [{ id: 'portal-2026-10-04-y', data: '2026-10-04', valor: 40, categoria: 'Assistência', evento: 'ATOS' }], total: 40 };
    await m.arm.gravarLotes([{ col: 'lotes', id: doPortal.id, lote: doPortal }, { col: 'lotes', id: soPortal.id, lote: soPortal }]);

    const e = await sincronizar(m.arm, CFG, 'teste', { modo: 'completo' });
    expect(e.ok).toBe(true);
    const l = m.cols.lotes.get('assistencia_2026_11_almada')!;
    expect(l.registos.map((r) => r.id).sort()).toEqual(['j1', 'portal-2026-11-15-x']);
    expect(l.total).toBe(220);
    // Lote que só tinha registos do portal não é apagado.
    expect(m.cols.lotes.get('assistencia_2026_10_porto')!.registos.map((r) => r.id)).toEqual(['portal-2026-10-04-y']);
  });

  it('reler tudo mantém as correções feitas no portal a registos do Jotform', async () => {
    const A = JOTFORM_FORMS.assistencia.id;
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({ ok: true, status: 200, json: async () => ({ responseCode: 200, content: !url.includes(A) ? [] : [
      { id: 'j1', created_at: '2026-11-08 12:00:00', status: 'ACTIVE', answers: { '1': { text: 'Dia', type: 'control_datetime', answer: { day: '08', month: '11', year: '2026' } }, '2': { text: 'Comunidade', answer: 'Almada' }, '3': { text: 'Jovens e Adultos', answer: '100' }, '4': { text: 'Evento', answer: 'Celebração Domingo' } } },
    ] }) }) as Response));
    const m = armazemMemoria();
    const corrigido: Lote = { id: 'assistencia_2026_11_almada', origem: 'assistencia', ano: 2026, mes: 11, periodo: '2026-11', comunidadeId: 'almada',
      registos: [{ id: 'j1', data: '2026-11-08', valor: 105, categoria: 'Assistência', evento: 'Celebração Domingo', extra: { alteradoPor: 'ana@x.pt', alteradoEm: '2026-11-17T10:00:00.000Z' } }], total: 105, n: 1, atualizadoEm: '', atualizadoPor: 'ana@x.pt' };
    await m.arm.gravarLotes([{ col: 'lotes', id: corrigido.id, lote: corrigido }]);

    await sincronizar(m.arm, CFG, 'teste', { modo: 'completo' });
    const l = m.cols.lotes.get('assistencia_2026_11_almada')!;
    expect(l.registos).toHaveLength(1);
    expect(l.registos[0]).toMatchObject({ id: 'j1', valor: 105, extra: { alteradoPor: 'ana@x.pt' } });
    expect(l.total).toBe(105);
  });

  it('não toca em meses fechados', async () => {
    vi.stubGlobal('fetch', jotformFalso({ [F]: [{ id: 'a', created_at: '2026-03-02 10:00:00', comunidade: 'Almada', valor: '50', nome: 'Ana' }] }).fetchFalso);
    const m = armazemMemoria(['2026-03']);
    const e = await sincronizar(m.arm, CFG, 'teste');
    expect(e.resultado.contribuir.novos).toBe(0);
    expect(e.resultado.contribuir.mesesFechadosIgnorados).toBe(1);
    expect(m.cols.lotes.size).toBe(0);
  });

  it('não corre duas sincronizações ao mesmo tempo', async () => {
    vi.stubGlobal('fetch', jotformFalso({}).fetchFalso);
    const m = armazemMemoria();
    await m.arm.marcarEmCurso({ desde: new Date().toISOString(), quem: 'outro' });
    await expect(sincronizar(m.arm, CFG, 'teste')).rejects.toBeInstanceOf(SyncEmCurso);
  });
});

describe('Unique ID do Jotform', () => {
  it('o campo de ID automático entra na linha como "Unique ID", mesmo sem rótulo', async () => {
    const { achatar } = await import('../../src/lib/jotform');
    const l = achatar({ id: '1', created_at: '2026-01-02 10:00:00', status: 'ACTIVE', answers: {
      '30': { name: 'uniqueId', type: 'control_autoincrement', text: '', answer: 'R20260031' },
    } });
    expect(l['Unique ID']).toBe('R20260031');
  });
});

describe('reembolso com data da fatura errada no Jotform', () => {
  it('data da fatura muito depois da submissão (ex.: 2028 em vez de 2026): usa a data de submissão e guarda a original', async () => {
    const { FONTES, mapearLinhas, sugerirMapa } = await import('../../src/lib/fontes');
    const l = { 'Submission ID': 's1', 'Submission Date': '2026-11-01 14:26:21', 'Data Fatura': '2028-10-29', 'Valor em Euros (€)': '124,00', Comunidade: 'CCLx Moita', Categoria: 'Obras', 'Unique ID': 'R20260437', 'Reembolso do Valor necessáro?': 'Sim' };
    const ok = { ...l, 'Submission ID': 's2', 'Data Fatura': '2026-10-29', 'Unique ID': 'R20260436' };
    const mapa = sugerirMapa(FONTES.despesas, Object.keys(l));
    const { registos } = mapearLinhas('despesas', [l, ok], mapa);
    expect(registos[0]).toMatchObject({ id: 's1', data: '2026-11-01', valor: 124, extra: { codigo: 'R20260437', dataFaturaOriginal: '2028-10-29' } });
    expect(registos[1].data).toBe('2026-10-29');
    expect(registos[1].extra?.dataFaturaOriginal).toBeUndefined();
  });
});

describe('filtros do Jotform: reembolsos e depósitos', () => {
  it('reembolsos: só entram os registos com "Reembolso do Valor necessário?" = Sim', async () => {
    const { FONTES, mapearLinhas, sugerirMapa } = await import('../../src/lib/fontes');
    const base = { 'Submission Date': '2026-11-01 10:00:00', 'Data Fatura': '2026-10-29', 'Valor em Euros (€)': '10', Comunidade: 'Moita', Categoria: 'Obras' };
    const ls = [{ ...base, 'Submission ID': 'a', 'Reembolso do Valor necessáro?': 'Sim' }, { ...base, 'Submission ID': 'b', 'Reembolso do Valor necessáro?': 'Não' }, { ...base, 'Submission ID': 'c', 'Reembolso do Valor necessáro?': '' }];
    const r = mapearLinhas('despesas', ls, sugerirMapa(FONTES.despesas, Object.keys(ls[0])));
    expect(r.registos.map((x) => x.id)).toEqual(['a']);
    expect(r.ignoradas).toBe(2);
  });
  it('depósitos: os registos com "Registo Inválido" preenchido são ignorados', async () => {
    const { FONTES, mapearLinhas, sugerirMapa } = await import('../../src/lib/fontes');
    const base = { 'Data presente no talão de depósito': '2026-11-02', 'Valor Depositado  €': '50', Comunidade: 'Almada' };
    const ls = [{ ...base, 'Submission ID': 'a', 'Registo Inválido': '' }, { ...base, 'Submission ID': 'b', 'Registo Inválido': 'Sim' }, { ...base, 'Submission ID': 'c', 'Registo Inválido': 'Não' }];
    const r = mapearLinhas('depositos', ls, sugerirMapa(FONTES.depositos, Object.keys(ls[0])));
    expect(r.registos.map((x) => x.id)).toEqual(['a', 'c']);
    expect(r.ignoradas).toBe(1);
  });
});

describe('reler tudo (completo): registos do portal também na cópia confidencial', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('mantém os pagamentos IFTHENPAY importados no portal (lotes e lotes_conf)', async () => {
    const { fetchFalso } = jotformFalso({ [F]: [{ id: 'j1', created_at: '2026-10-02 10:00:00', comunidade: 'Almada', valor: '50', nome: 'Ana' }] });
    vi.stubGlobal('fetch', fetchFalso);
    const m = armazemMemoria();
    const ifp: Lote = { id: 'contribuir_2026_10_almada', origem: 'contribuir', ano: 2026, mes: 10, periodo: '2026-10', comunidadeId: 'almada', total: 4, n: 1, atualizadoEm: '', atualizadoPor: 'x',
      registos: [{ id: 'portal-ifthenpay-A1', data: '2026-10-03', valor: 4, categoria: 'R1.02', extra: { liquido: 3.88, fonte: 'ifthenpay' } }] };
    await m.arm.gravarLotes([{ col: 'lotes', id: ifp.id, lote: ifp }, { col: 'lotes_conf', id: ifp.id, lote: ifp }]);
    await sincronizar(m.arm, CFG, 'teste', { modo: 'completo' });
    expect(m.cols.lotes.get(ifp.id)!.registos.map((r) => r.id).sort()).toEqual(['j1', 'portal-ifthenpay-A1']);
    expect(m.cols.lotes_conf.get(ifp.id)!.registos.map((r) => r.id).sort()).toEqual(['j1', 'portal-ifthenpay-A1']);
    expect(m.cols.lotes_conf.get(ifp.id)!.total).toBe(54);
  });
});
