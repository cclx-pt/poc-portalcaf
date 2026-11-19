import { describe, expect, it } from 'vitest';
import { EVENTOS_INICIAIS, ID_PORTAL, comunidadesDoUtilizador, corrigirRegisto, entradaDeRegisto, eCorrigido, acrescentarRegisto, novoRegistoPresenca, removerRegisto, validarPresenca } from '../../src/lib/presencas';
import type { Lote } from '../../src/lib/types';

const entrada = { data: '2026-11-15', evento: 'Celebração Domingo', comunidadeId: 'almada', adultos: 120, jump: 8, criancas: 20, connects: 5, observacoes: 'Culto com visitas' };

describe('registo de presenças no portal', () => {
  it('tem os tipos de evento do formulário Jotform por defeito', () => {
    expect(EVENTOS_INICIAIS).toEqual(['Celebração Domingo', 'Reunião Oração', 'ATOS', 'Outra']);
  });
  it('valida os campos obrigatórios como no Jotform', () => {
    expect(validarPresenca({ ...entrada }, '2026-11-16')).toBeNull();
    expect(validarPresenca({ ...entrada, data: '' }, '2026-11-16')).toMatch(/data/i);
    expect(validarPresenca({ ...entrada, data: '2026-11-17' }, '2026-11-16')).toMatch(/futura/i);
    expect(validarPresenca({ ...entrada, evento: '' }, '2026-11-16')).toMatch(/evento/i);
    expect(validarPresenca({ ...entrada, evento: 'Outra', descricao: '' }, '2026-11-16')).toMatch(/descri/i);
    expect(validarPresenca({ ...entrada, comunidadeId: '' }, '2026-11-16')).toMatch(/comunidade/i);
    expect(validarPresenca({ ...entrada, adultos: -1 }, '2026-11-16')).toMatch(/jovens e adultos/i);
    expect(validarPresenca({ ...entrada, criancas: 2.5 }, '2026-11-16')).toMatch(/crianças/i);
  });
  it('campos numéricos começam em branco e são obrigatórios (0 escreve-se)', () => {
    expect(validarPresenca({ ...entrada, adultos: NaN }, '2026-11-16')).toBe('Indique o número de jovens e adultos (0 se não houve).');
    expect(validarPresenca({ ...entrada, connects: NaN }, '2026-11-16')).toBe("Indique o número de Connect's (0 se não houve).");
  });
  it('cria um registo com a forma dos registos do Jotform', () => {
    const r = novoRegistoPresenca({ ...entrada, evento: 'Outra', descricao: 'Vigília' }, 'ana@x.pt');
    expect(r.id.startsWith(ID_PORTAL)).toBe(true);
    expect(r).toMatchObject({ data: '2026-11-15', valor: 120, categoria: 'Assistência', evento: 'Outra', descricao: 'Vigília', extra: { jump: 8, criancas: 20, connects: 5, observacoes: 'Culto com visitas', registadoPor: 'ana@x.pt' } });
  });
  it('acrescenta ao lote mensal da comunidade (cria-o se não existir) e remove', () => {
    const r = novoRegistoPresenca(entrada, 'ana@x.pt');
    const l1 = acrescentarRegisto(undefined, r, 'ana@x.pt', 'almada');
    expect(l1).toMatchObject({ id: 'assistencia_2026_11_almada', origem: 'assistencia', ano: 2026, mes: 11, periodo: '2026-11', comunidadeId: 'almada', n: 1, total: 120 });
    const r2 = novoRegistoPresenca({ ...entrada, data: '2026-11-08', adultos: 100 }, 'ana@x.pt');
    const l2 = acrescentarRegisto(l1, r2, 'ana@x.pt');
    expect(l2.n).toBe(2); expect(l2.total).toBe(220);
    expect(l2.registos.map((x) => x.data)).toEqual(['2026-11-08', '2026-11-15']); // ordenado por data
    const l3 = removerRegisto(l2, r.id);
    expect(l3.n).toBe(1); expect(l3.total).toBe(100);
  });
  it('avisa quando já existe registo do mesmo evento no mesmo dia e comunidade', () => {
    const r = novoRegistoPresenca(entrada, 'ana@x.pt');
    const lote: Lote = acrescentarRegisto(undefined, r, 'ana@x.pt', 'almada');
    expect(validarPresenca(entrada, '2026-11-16', [lote])).toMatch(/já existe/i);
    expect(validarPresenca({ ...entrada, evento: 'ATOS' }, '2026-11-16', [lote])).toBeNull();
  });

  it('só oferece as comunidades a que o utilizador tem acesso', () => {
    const todas = [{ id: 'almada', nome: 'Almada', ordem: 1 }, { id: 'porto', nome: 'Porto', ordem: 2 }, { id: 'moita', nome: 'Moita', ordem: 3, ativo: false }, { id: 'bolsa-geral', nome: 'Bolsa', ordem: 9, especial: true }];
    expect(comunidadesDoUtilizador(todas, ['*']).map((c) => c.id)).toEqual(['almada', 'porto']);
    expect(comunidadesDoUtilizador(todas, ['porto']).map((c) => c.id)).toEqual(['porto']);
    expect(comunidadesDoUtilizador(todas, ['moita', 'bolsa-geral'])).toEqual([]);
    expect(comunidadesDoUtilizador(todas, [])).toEqual([]);
  });

  describe('corrigir registos anteriores', () => {
    const jot: Lote = { id: 'assistencia_2026_11_almada', origem: 'assistencia', ano: 2026, mes: 11, periodo: '2026-11', comunidadeId: 'almada',
      registos: [
        { id: 'j1', data: '2026-11-08', valor: 100, categoria: 'Assistência', evento: 'Celebração Domingo', extra: { jump: 4, criancas: 10 } },
        { id: 'j2', data: '2026-11-15', valor: 90, categoria: 'Assistência', evento: 'Celebração Domingo' },
      ], total: 190, n: 2, atualizadoEm: '', atualizadoPor: '' };
    const AGORA = '2026-11-17T14:00:00.000Z';

    it('preenche o formulário a partir do registo (campos vazios do Jotform contam 0)', () => {
      expect(entradaDeRegisto(jot.registos[0], 'almada')).toMatchObject({ data: '2026-11-08', evento: 'Celebração Domingo', comunidadeId: 'almada', adultos: 100, jump: 4, criancas: 10, connects: 0 });
    });
    it('corrige, guarda quem e quando alterou e descreve a alteração', () => {
      const e = { ...entradaDeRegisto(jot.registos[0], 'almada'), adultos: 105, observacoes: 'Contagem revista' };
      const r = corrigirRegisto(jot, 'j1', e, 'ana@x.pt', '2026-11-17', AGORA);
      const c = r.lote.registos.find((x) => x.id === 'j1')!;
      expect(c).toMatchObject({ valor: 105, extra: { jump: 4, criancas: 10, connects: 0, observacoes: 'Contagem revista', alteradoPor: 'ana@x.pt', alteradoEm: AGORA } });
      expect(eCorrigido(c)).toBe(true);
      expect(r.lote.total).toBe(195);
      expect(r.lote.atualizadoPor).toBe('ana@x.pt');
      expect(r.alteracoes).toBe('Jovens e adultos: 100 → 105; Observações: (vazio) → Contagem revista');
    });
    it('não aceita mudar de mês nem duplicar outro registo; sem alterações não grava', () => {
      const base = entradaDeRegisto(jot.registos[0], 'almada');
      expect(() => corrigirRegisto(jot, 'j1', { ...base, data: '2026-10-25' }, 'a@x.pt', '2026-11-17', AGORA)).toThrow(/mesmo mês/);
      expect(() => corrigirRegisto(jot, 'j1', { ...base, data: '2026-11-15' }, 'a@x.pt', '2026-11-17', AGORA)).toThrow(/Já existe/);
      expect(() => corrigirRegisto(jot, 'j1', { ...base, adultos: NaN }, 'a@x.pt', '2026-11-17', AGORA)).toThrow(/jovens e adultos/);
      expect(() => corrigirRegisto(jot, 'j1', base, 'a@x.pt', '2026-11-17', AGORA)).toThrow(/Não há alterações/);
    });
  });

  describe('com eventos configurados', () => {
    const oracao = { id: 'reuniao-oracao', nome: 'Reunião Oração', ativo: true, contagens: ['adultos', 'online'], dias: [2], horario: { diaTodo: true as const } };
    const e = { data: '2026-11-17', evento: 'Reunião Oração', comunidadeId: 'almada', adultos: 12, jump: NaN, criancas: NaN, connects: NaN, outras: { online: 30 } };
    it('só exige as contagens do evento e respeita os dias da semana', () => {
      expect(validarPresenca(e, '2026-11-17', [], undefined, oracao)).toBeNull();
      expect(validarPresenca({ ...e, outras: {} }, '2026-11-17', [], undefined, oracao)).toMatch(/online/i);
      expect(validarPresenca({ ...e, data: '2026-11-15' }, '2026-11-17', [], undefined, oracao)).toBe('"Reunião Oração" só ocorre: terça.');
    });
    it('grava as contagens extra e põe a 0 as que o evento não recolhe', () => {
      const r = novoRegistoPresenca(e, 'ana@x.pt');
      expect(r).toMatchObject({ valor: 12, extra: { jump: 0, criancas: 0, connects: 0, online: 30 } });
      expect(entradaDeRegisto(r, 'almada', ['online']).outras).toEqual({ online: 30 });
    });
  });
});


describe('presenças: filtros, ocorrências e auditoria dos eventos', () => {
  const reg = (id: string, data: string, evento: string, valor: number, extra: Record<string, number> = {}) => ({ id, data, evento, valor, categoria: 'Assistência', extra });
  const lote = (com: string, mes: number, registos: ReturnType<typeof reg>[]): Lote => ({ id: `assistencia_2026_${String(mes).padStart(2, '0')}_${com}`, origem: 'assistencia', ano: 2026, mes, periodo: `2026-${String(mes).padStart(2, '0')}`, comunidadeId: com, registos, total: 0, n: registos.length, atualizadoEm: '', atualizadoPor: '' } as unknown as Lote);
  const lotes = [
    lote('almada', 11, [reg('a1', '2026-11-08', 'Celebração Domingo', 100, { jump: 5 }), reg('a2', '2026-11-15', 'Celebração Domingo', 120), reg('a3', '2026-11-11', 'Reunião Oração', 20)]),
    lote('moita', 11, [reg('m1', '2026-11-08', 'Celebração Domingo', 60, { jump: 3, criancas: 10 }), reg('m2', '2026-11-15', 'celebração domingo', 70)]),
  ];
  it('filtra os registos por comunidade, datas e tipo de culto', async () => {
    const { filtrarLotesPresenca } = await import('../../src/lib/presencas');
    const ids = (ls: Lote[]) => ls.flatMap((l) => l.registos.map((r) => r.id));
    expect(ids(filtrarLotesPresenca(lotes, { comunidadeId: 'almada' }))).toEqual(['a1', 'a2', 'a3']);
    expect(ids(filtrarLotesPresenca(lotes, { de: '2026-11-10', ate: '2026-11-14' }))).toEqual(['a3']);
    expect(ids(filtrarLotesPresenca(lotes, { evento: 'Celebração Domingo' }))).toEqual(['a1', 'a2', 'm1', 'm2']);
    expect(ids(filtrarLotesPresenca(lotes, {}))).toHaveLength(5);
  });
  it('agrupa por ocorrência do evento (data + evento): a média é por domingo, não por registo', async () => {
    const { ocorrenciasDeEvento } = await import('../../src/lib/presencas');
    const linhas = lotes.flatMap((l) => l.registos.map((r) => ({ data: r.data, evento: r.evento, comunidadeId: l.comunidadeId, adultos: r.valor, jump: Number(r.extra?.jump ?? 0) })));
    const oc = ocorrenciasDeEvento(linhas.filter((l) => /celebra/i.test(l.evento)), ['adultos', 'jump']);
    expect(oc.map((o) => [o.data, o.adultos, o.jump, o.registos])).toEqual([['2026-11-08', 160, 8, 2], ['2026-11-15', 190, 0, 2]]);
  });
  it('auditoria dos eventos: quantos registos têm cada contagem preenchida', async () => {
    const { auditoriaEventos } = await import('../../src/lib/presencas');
    const eventos = [{ id: 'cel', nome: 'Celebração Domingo', ativo: true, contagens: ['adultos', 'jump', 'criancas'], dias: [0], horario: { diaTodo: true as const } }, { id: 'atos', nome: 'ATOS', ativo: true, contagens: ['adultos'], dias: [], horario: { diaTodo: true as const } }];
    const a = auditoriaEventos(eventos, lotes);
    expect(a.cel).toEqual({ registos: 4, ultimo: '2026-11-15', porContagem: { adultos: 4, jump: 2, criancas: 1 } });
    expect(a.atos).toEqual({ registos: 0, ultimo: null, porContagem: { adultos: 0 } });
  });
});

describe('presenças: duplicados e importação do Jotform só de registos novos', () => {
  const reg = (id: string, data: string, evento: string, valor = 10) => ({ id, data, evento, valor, categoria: 'Assistência' });
  const lote = (registos: ReturnType<typeof reg>[], extra: Partial<Lote> = {}): Lote => ({ id: 'assistencia_2026_11_almada', origem: 'assistencia', ano: 2026, mes: 11, periodo: '2026-11', comunidadeId: 'almada', registos, total: 0, n: registos.length, atualizadoEm: '', atualizadoPor: '', ...extra } as Lote);
  it('identifica registos duplicados (mesma comunidade, dia e evento) e filtra só esses', async () => {
    const { duplicadosPresenca, filtrarLotesPresenca } = await import('../../src/lib/presencas');
    const ls = [lote([reg('a', '2026-11-08', 'Celebração Domingo'), reg('b', '2026-11-08', 'celebração domingo'), reg('c', '2026-11-08', 'Reunião Oração'), reg('d', '2026-11-15', 'Celebração Domingo')])];
    expect([...duplicadosPresenca(ls)].sort()).toEqual(['a', 'b']);
    expect(filtrarLotesPresenca(ls, { soDuplicados: true }).flatMap((l) => l.registos.map((r) => r.id))).toEqual(['a', 'b']);
  });
  it('apagar um registo vindo do Jotform guarda o id, para não voltar a ser importado', async () => {
    const { removerRegisto } = await import('../../src/lib/presencas');
    const l = removerRegisto(lote([reg('241', '2026-11-08', 'Celebração Domingo'), reg('portal-1', '2026-11-15', 'Celebração Domingo')]), '241');
    expect(l.registos.map((r) => r.id)).toEqual(['portal-1']);
    expect(l.apagados).toEqual(['241']);
    expect(removerRegisto(l, 'portal-1').apagados).toEqual(['241']);
  });
  it('a importação só acrescenta submissões novas: não repete as apagadas nem um dia e evento já registados', async () => {
    const { fundirAssistencia } = await import('../../src/lib/sync');
    const existente = lote([reg('portal-1', '2026-11-08', 'Celebração Domingo', 99)], { apagados: ['241'] });
    const novo = lote([reg('241', '2026-11-01', 'Celebração Domingo'), reg('242', '2026-11-08', 'Celebração Domingo', 50), reg('243', '2026-11-15', 'Celebração Domingo', 70), reg('244', '2026-11-11', 'Reunião Oração')]);
    const r = fundirAssistencia(existente, novo);
    expect(r.lote.registos.map((x) => x.id)).toEqual(['portal-1', '244', '243']);
    expect(r.acrescentados).toBe(2);
    expect(r.ignorados).toBe(2);
    expect(r.lote.apagados).toEqual(['241']);
    expect(fundirAssistencia(r.lote, novo).acrescentados).toBe(0);
  });
});

describe('erro do formulário de presenças → campo a destacar', () => {
  it('liga cada mensagem de validação ao campo com erro', async () => {
    const { campoDoErroPresenca, validarPresenca } = await import('../../src/lib/presencas');
    const e = { data: '2026-11-15', evento: 'Celebração Domingo', comunidadeId: 'almada', adultos: 120, jump: 8, criancas: 20, connects: 5, observacoes: '' };
    const campo = (x: Partial<typeof e>) => campoDoErroPresenca(validarPresenca({ ...e, ...x }, '2026-11-16') ?? '');
    expect(campo({ data: '' })).toBe('data');
    expect(campo({ data: '2026-11-17' })).toBe('data');
    expect(campo({ evento: '' })).toBe('evento');
    expect(campo({ evento: 'Outra' })).toBe('descricao');
    expect(campo({ comunidadeId: '' })).toBe('comunidade');
    expect(campo({ adultos: NaN })).toBe('adultos');
    expect(campo({ criancas: 2.5 })).toBe('criancas');
    expect(campo({ jump: -1 })).toBe('jump');
    expect(campoDoErroPresenca('Indique o número de Online (0 se não houve).', { online: 'Online' })).toBe('online');
  });
});

describe('peso da média de cada comunidade no total', () => {
  it('a percentagem é a média da comunidade a dividir pela soma das médias', async () => {
    const { pesoDasMedias } = await import('../../src/lib/presencas');
    expect(pesoDasMedias({ sede: 268, almada: 100, moita: 32 })).toEqual({ sede: 0.67, almada: 0.25, moita: 0.08 });
    expect(pesoDasMedias({})).toEqual({});
  });
});
