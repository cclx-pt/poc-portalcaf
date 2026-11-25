import { describe, expect, it } from 'vitest';
import { PARAMETROS_REEMBOLSOS as PARAMETROS,
  extrairTelefoneMascarado, normalizarTelefones, reconciliarReembolsos, relatorioInverso,
  type SubmissaoReembolso,
} from '../../src/lib/reconciliacaoReembolsos';
import type { MovBanco } from '../../src/lib/types';

const mov = (id: string, data: string, descricao: string, valor: number): MovBanco => ({ id, data, descricao, valor, contabilizar: false });
const sub = (id: string, submetido: string, valor: number, extra: Partial<SubmissaoReembolso> = {}): SubmissaoReembolso => ({
  id, codigo: id, submetido, valor, comunidadeId: 'almada', forma: 'mbway', estado: 'Fechado', ...extra,
});
const um = (r: ReturnType<typeof reconciliarReembolsos>, id: string) => r.find((x) => x.movId === id)!;

describe('normalização', () => {
  it('lê o telefone mascarado do descritivo MB Way', () => {
    expect(extrairTelefoneMascarado('Trf Mbway 924XXX727')).toEqual({ prefixo: '924', sufixo: '727' });
    expect(extrairTelefoneMascarado('TRF MB WAY 912xxx345 Reembolso')).toEqual({ prefixo: '912', sufixo: '345' });
    expect(extrairTelefoneMascarado('Reembolso')).toBeNull();
  });
  it('normaliza telefones do Jotform (indicativo, espaços, vários números)', () => {
    expect(normalizarTelefones('+351 924 123 727')).toEqual(['924123727']);
    expect(normalizarTelefones('00351924123727')).toEqual(['924123727']);
    expect(normalizarTelefones('924123727912000345')).toEqual(['924123727', '912000345']);
    expect(normalizarTelefones('')).toEqual([]);
  });
});

describe('casos de teste da especificação (T1 a T12)', () => {
  it('T1: Unique ID no descritivo e valor igual → Confirmado, regra 1', () => {
    const r = reconciliarReembolsos([mov('m1', '2026-11-03', 'Trf Mbway 924XXX727 R2026 0031', -128.51)], [sub('R20260031', '2026-11-01', 128.51)]);
    expect(um(r, 'm1')).toMatchObject({ estado: 'Confirmado', regra: 1, score: 100, submissoes: ['R20260031'] });
  });

  it('T2: Unique ID com valor diferente → Provável, com a diferença nas observações', () => {
    const r = reconciliarReembolsos([mov('m1', '2026-11-03', 'Reembolso R20260031', -120)], [sub('R20260031', '2026-11-01', 128.51)]);
    const x = um(r, 'm1');
    expect(x).toMatchObject({ estado: 'Provável', regra: 1, submissoes: ['R20260031'] });
    expect(x.observacoes.join(' ')).toMatch(/128,51 € \(diferença de 8,51 €\)/);
  });

  it('T3: telefone parcial, valor e data batem com uma única submissão → Confirmado, regra 2', () => {
    const r = reconciliarReembolsos([mov('m1', '2026-11-12', 'Trf Mbway 924XXX727', -45)], [
      sub('R20260040', '2026-11-01', 45, { telefone: '924 123 727' }),
      sub('R20260041', '2026-11-01', 45, { telefone: '912000345' }),
    ]);
    expect(um(r, 'm1')).toMatchObject({ estado: 'Confirmado', regra: 2, score: 100, submissoes: ['R20260040'] });
  });

  it('T4: vários movimentos do mesmo telefone no mesmo dia, valores diferentes → cada um com a sua submissão', () => {
    const r = reconciliarReembolsos([
      mov('m1', '2026-11-10', 'Trf Mbway 924XXX727', -20),
      mov('m2', '2026-11-10', 'Trf Mbway 924XXX727', -35.5),
    ], [
      sub('R20260050', '2026-11-05', 35.5, { telefone: '924123727' }),
      sub('R20260051', '2026-11-05', 20, { telefone: '924123727' }),
    ]);
    expect(um(r, 'm1').submissoes).toEqual(['R20260051']);
    expect(um(r, 'm2').submissoes).toEqual(['R20260050']);
  });

  it('T5: submissão sem telefone, valor exato e data próxima → Provável, regra 3', () => {
    const r = reconciliarReembolsos([mov('m1', '2026-11-03', 'Trf Mbway 924XXX727', -60)], [sub('R20260060', '2026-11-03', 60)]);
    const x = um(r, 'm1');
    expect(x).toMatchObject({ estado: 'Provável', regra: 3, score: 70, submissoes: ['R20260060'] });
    expect(x.observacoes).toContain('Telemóvel não preenchido na submissão; match por valor e data');
  });

  it('T6: telefone certo e diferença até 0,50 € → Provável, com a diferença', () => {
    const r = reconciliarReembolsos([mov('m1', '2026-11-06', 'Trf Mbway 924XXX727', -30)], [sub('R20260070', '2026-11-01', 30.4, { telefone: '924123727' })]);
    const x = um(r, 'm1');
    expect(x.estado).toBe('Provável');
    expect(x.regra).toBe(2);
    expect(x.observacoes.join(' ')).toMatch(/diferença de 0,40 €/);
  });

  it('T7: descritivo "Reembolso" sem telefone, um único candidato pelo valor → Provável, regra 3', () => {
    const r = reconciliarReembolsos([mov('m1', '2026-11-10', 'Reembolso', -75)], [
      sub('R20260080', '2026-11-02', 75, { forma: 'transferencia' }),
      sub('R20260081', '2026-11-02', 80),
    ]);
    const x = um(r, 'm1');
    expect(x).toMatchObject({ estado: 'Provável', regra: 3, submissoes: ['R20260080'] });
    expect(x.observacoes).toContain('Descrição sem MB Way; match por valor');
  });

  it('T8: descritivo sem telefone e vários candidatos pelo valor → Ambíguo, com os candidatos', () => {
    const r = reconciliarReembolsos([mov('m1', '2026-11-10', 'Reembolso', -50)], [
      sub('R20260090', '2026-11-02', 50, { pessoa: 'Ana' }),
      sub('R20260091', '2026-11-04', 50, { pessoa: 'Rui' }),
    ]);
    const x = um(r, 'm1');
    expect(x.estado).toBe('Ambíguo');
    expect(x.submissoes).toEqual([]);
    expect(x.candidatos.map((c) => c.id).sort()).toEqual(['R20260090', 'R20260091']);
  });

  it('T9: mesmo valor recorrente da mesma pessoa em meses diferentes → FIFO, sem trocas', () => {
    const r = reconciliarReembolsos([
      mov('m1', '2026-10-05', 'Trf Mbway 924XXX727', -25),
      mov('m2', '2026-11-05', 'Trf Mbway 924XXX727', -25),
    ], [
      sub('R20260101', '2026-10-30', 25, { telefone: '924123727', pessoa: 'Ana' }),
      sub('R20260100', '2026-10-01', 25, { telefone: '924123727', pessoa: 'Ana' }),
    ]);
    expect(um(r, 'm1').submissoes).toEqual(['R20260100']);
    expect(um(r, 'm2').submissoes).toEqual(['R20260101']);
  });

  it('T10: telefone sem submissões, mesmo valor todos os meses → Sem submissão; pagamento mensal fixo', () => {
    const r = reconciliarReembolsos([
      mov('m1', '2026-09-28', 'Trf Mbway 913XXX111', -150),
      mov('m2', '2026-10-28', 'Trf Mbway 913XXX111', -150),
    ], [sub('R20260110', '2026-10-01', 40, { telefone: '924123727' })]);
    for (const id of ['m1', 'm2']) {
      expect(um(r, id).estado).toBe('Sem submissão');
      expect(um(r, id).observacoes).toContain('Sem submissão; pagamento mensal fixo');
    }
  });

  it('T11: submissão CANCELADO MANUALMENTE com o mesmo valor → nunca escolhida', () => {
    const r = reconciliarReembolsos([mov('m1', '2026-11-03', 'Trf Mbway 924XXX727', -60)], [
      sub('R20260120', '2026-11-01', 60, { telefone: '924123727', estado: 'CANCELADO MANUALMENTE' }),
    ]);
    expect(um(r, 'm1')).toMatchObject({ estado: 'Sem submissão', submissoes: [] });
  });

  it('T12: submissão fechada sem movimento no período → relatório inverso', () => {
    const subs = [sub('R20260130', '2026-11-02', 90), sub('R20260131', '2026-11-03', 15)];
    const r = reconciliarReembolsos([mov('m1', '2026-11-05', 'Trf Mbway 924XXX727', -15)], subs);
    expect(relatorioInverso(subs, r, { de: '2026-11-01', ate: '2026-11-30' }).map((s) => s.id)).toEqual(['R20260130']);
  });
});

describe('regras adicionais', () => {
  it('telefone inferido de outra submissão da mesma pessoa conta 30 e fica nas observações', () => {
    const r = reconciliarReembolsos([mov('m1', '2026-11-04', 'Trf Mbway 924XXX727', -33)], [
      sub('R20260140', '2026-11-02', 33, { pessoa: 'José  Silva' }),
      sub('R20260010', '2026-03-02', 12, { pessoa: 'jose silva', telefone: '924123727' }),
    ], new Set(['R20260010']));
    const x = um(r, 'm1');
    expect(x).toMatchObject({ regra: 2, submissoes: ['R20260140'], estado: 'Confirmado' });
    expect(x.observacoes.join(' ')).toMatch(/Telefone inferido de outra submissão de José Silva/);
  });

  it('agregado: soma de várias submissões do mesmo telefone → Agregado (para revisão)', () => {
    const r = reconciliarReembolsos([mov('m1', '2026-11-10', 'Trf Mbway 924XXX727', -55)], [
      sub('R20260150', '2026-11-01', 20, { telefone: '924123727' }),
      sub('R20260151', '2026-11-02', 35, { telefone: '924123727' }),
      sub('R20260152', '2026-11-02', 70, { telefone: '924123727' }),
    ]);
    expect(um(r, 'm1')).toMatchObject({ estado: 'Agregado', regra: 4 });
    expect(um(r, 'm1').submissoes.sort()).toEqual(['R20260150', 'R20260151']);
  });

  it('janela: movimento mais de 45 dias depois da submissão (ou mais de 2 antes) não serve; é configurável', () => {
    const subs = [sub('R20260160', '2026-09-01', 80, { telefone: '924123727' })];
    expect(um(reconciliarReembolsos([mov('m1', '2026-10-20', 'Trf Mbway 924XXX727', -80)], subs), 'm1').estado).toBe('Sem submissão');
    expect(um(reconciliarReembolsos([mov('m1', '2026-10-20', 'Trf Mbway 924XXX727', -80)], subs, new Set(), { diasAntes: 2, diasDepois: 60 }), 'm1').submissoes).toEqual(['R20260160']);
  });

  it('submissões já conciliadas noutra execução não voltam a ser usadas', () => {
    const r = reconciliarReembolsos([mov('m1', '2026-11-03', 'Trf Mbway 924XXX727', -60)], [sub('R20260170', '2026-11-01', 60, { telefone: '924123727' })], new Set(['R20260170']));
    expect(um(r, 'm1').estado).toBe('Sem submissão');
  });

  it('só trata saídas com MB Way, transferência ou "Reembolso"', () => {
    const r = reconciliarReembolsos([mov('m1', '2026-11-03', 'Trf Mbway 924XXX727', 60), mov('m2', '2026-11-03', 'EDP Comercial', -60)], [sub('R20260180', '2026-11-01', 60)]);
    expect(r).toEqual([]);
  });
});

describe('sincronização do Registo de Despesas', () => {
  it('guarda a Forma de Reembolso, o Manual Control e a data de submissão; o telefone fica só como dado pessoal', async () => {
    const { FONTES, mapearLinhas, sugerirMapa, anonimizar } = await import('../../src/lib/fontes');
    const linha = {
      'Submission ID': '6000', 'Submission Date': '2026-11-02 10:00:00', 'Data Fatura': '2026-10-30', 'Valor em Euros (€)': '45,00',
      'Reembolso do Valor necessaro?': 'Sim', 'Unique ID': 'R20260040', 'Forma de Reembolso': 'MbWay', 'Manual Control': 'Fechado',
      'Telefone para pagamento de MBWhay': '+351 924 123 727', 'Nome': 'Ana', 'Comunidade': 'Almada',
    };
    const mapa = sugerirMapa(FONTES.despesas, Object.keys(linha));
    const [r] = mapearLinhas('despesas', [linha], mapa).registos;
    expect(r.extra).toMatchObject({ forma: 'MbWay', estado: 'Fechado', submetido: '2026-11-02', codigo: 'R20260040' });
    expect(r.telefone).toBe('+351 924 123 727');
    expect(anonimizar(r).telefone).toBeUndefined();
    const { submissoesDeLotes } = await import('../../src/lib/reconciliacaoReembolsos');
    const [s] = submissoesDeLotes([{ id: 'x', origem: 'despesas', ano: 2026, mes: 10, periodo: '2026-10', comunidadeId: 'almada', registos: [r], total: 45, n: 1, atualizadoEm: '', atualizadoPor: '' }]);
    expect(s).toMatchObject({ forma: 'mbway', estado: 'Fechado', submetido: '2026-11-02', codigo: 'R20260040', telefone: '+351 924 123 727' });
  });
});

describe('revisão: aplicar a decisão ao movimento', () => {
  const cats = [{ id: 'f302', nome: 'Reembolsos (contados pelo Jotform)', codigo: 'F3.02', tipo: 'financeiro' }] as never;
  it('conciliar: F3.02, comunidade da submissão, Unique ID no Nº doc, revisor e data na nota, validado', async () => {
    const { conciliarComSubmissoes } = await import('../../src/lib/reconciliacaoReembolsos');
    const m = conciliarComSubmissoes(mov('m1', '2026-11-03', 'Trf Mbway 924XXX727', -45), [sub('R20260040', '2026-11-01', 45)], cats,
      { estado: 'Provável', regra: 2, score: 78 }, 'caf@cclx.pt', '2026-11-25');
    expect(m).toMatchObject({ conciliadoCom: 'despesas:R20260040', categoria: 'Reembolsos (contados pelo Jotform)', comunidadeId: 'almada', documento: 'R20260040', estado: 'validado', contabilizar: false });
    expect(m.nota).toMatch(/Reembolso R20260040 \(regra 2, Provável, score 78\); revisto por caf@cclx\.pt em 25\/11\/2026/);
  });
  it('pendentes: saídas por conciliar, sem as validadas nem as rejeitadas na revisão', async () => {
    const { pendentesDeRevisao, NOTA_REJEITADO } = await import('../../src/lib/reconciliacaoReembolsos');
    const ms = [
      mov('a', '2026-11-03', 'Trf Mbway 924XXX727', -45),
      { ...mov('b', '2026-11-03', 'Trf Mbway 924XXX727', -45), conciliadoCom: 'despesas:x' },
      { ...mov('c', '2026-11-03', 'Trf Mbway 924XXX727', -45), estado: 'validado' as const },
      { ...mov('d', '2026-11-03', 'Trf Mbway 924XXX727', -45), nota: `${NOTA_REJEITADO} por x` },
      mov('e', '2026-11-03', 'Trf Mbway 924XXX727', 45),
    ];
    expect(pendentesDeRevisao(ms).map((x) => x.id)).toEqual(['a']);
  });
});

describe('telefones da base de Pessoas', () => {
  it('uma submissão sem telefone usa o telemóvel da pessoa com o mesmo nome na base de Pessoas', () => {
    const r = reconciliarReembolsos([mov('m1', '2026-11-04', 'Trf Mbway 966XXX014', -33)], [sub('R20260190', '2026-11-02', 33, { pessoa: 'Ana Silva' })],
      new Set(), PARAMETROS, [{ nome: 'ana  silva', telefone: '966123014' }]);
    expect(r[0]).toMatchObject({ regra: 2, submissoes: ['R20260190'] });
    expect(r[0].observacoes.join(' ')).toMatch(/Telefone inferido/);
  });
});
