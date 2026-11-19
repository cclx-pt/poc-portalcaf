import { describe, expect, it } from 'vitest';
import { domingosDoAno, domingosEmFalta, eDomingo } from '../../src/lib/domingos';
import type { Comunidade, ExcecaoAssistencia, Lote } from '../../src/lib/types';

const COMS: Comunidade[] = [
  { id: 'almada', nome: 'Almada', ordem: 1 },
  { id: 'barreiro', nome: 'Barreiro', ordem: 2, fim: '2026-10-31' },
  { id: 'bolsa-geral', nome: 'Bolsa', ordem: 99, especial: true },
];
const ass = (comunidadeId: string, datas: string[]): Lote => ({
  id: `a_${comunidadeId}`, origem: 'assistencia', ano: 2026, mes: Number(datas[0].slice(5, 7)), periodo: datas[0].slice(0, 7), comunidadeId,
  registos: datas.map((d, i) => ({ id: `${comunidadeId}${i}`, data: d, valor: 50, categoria: 'Assistência' })), total: 0, n: datas.length, atualizadoEm: '', atualizadoPor: '',
});
const exc = (data: string, ambito: string): ExcecaoAssistencia => ({ id: `${data}_${ambito}`, data, ambito, motivo: 'x', criadoPor: '', criadoEm: '' });

describe('domingos', () => {
  it('reconhece domingos sem depender do fuso horário', () => {
    expect(eDomingo('2026-11-15')).toBe(true);
    expect(eDomingo('2026-11-14')).toBe(false);
    expect(eDomingo('2026-01-04')).toBe(true);
  });
  it('lista os domingos do ano antes de uma data', () => {
    const d = domingosDoAno(2026, '2027-01-01');
    expect(d).toHaveLength(52);
    expect(d[0]).toBe('2026-01-04');
    expect(d[d.length - 1]).toBe('2026-12-27');
    expect(domingosDoAno(2026, '2026-01-11')).toEqual(['2026-01-04']); // o domingo "de hoje" não entra
  });
  it('conta os domingos em falta com exceções e vigência', () => {
    const r = domingosEmFalta({
      ano: 2026, hoje: '2026-11-15', comunidades: COMS,
      assistencia: [ass('almada', ['2026-01-04', '2026-01-11']), ass('barreiro', ['2026-10-25'])],
      excecoes: [exc('2026-01-18', 'cclx'), exc('2026-01-25', 'almada'), exc('2026-01-25', 'cclx')],
    });
    const almada = r.find((x) => x.comunidadeId === 'almada')!;
    const barreiro = r.find((x) => x.comunidadeId === 'barreiro')!;
    // domingos antes de 2026-11-15: 45; menos 2 exceções (18/01 CCLX, 25/01) = 43 esperados
    expect(almada.esperados).toBe(43);
    expect(almada.comRegisto).toBe(2);
    expect(almada.emFalta).toHaveLength(41);
    expect(almada.emFalta).not.toContain('2026-01-18');
    expect(almada.emFalta[0]).toBe('2026-02-01');
    // Barreiro até 31/10: 43 domingos, menos 2 exceções da CCLX (18/01 e 25/01) = 41
    expect(barreiro.esperados).toBe(41);
    expect(barreiro.emFalta).not.toContain('2026-11-01');
    expect(r.some((x) => x.comunidadeId === 'bolsa-geral')).toBe(false);
  });

  it('com o tipo de celebração, só um registo desse tipo ao domingo conta', () => {
    const l = ass('almada', ['2026-01-04', '2026-01-11']);
    l.registos[0].evento = 'Celebração de Domingo';
    l.registos[1].evento = 'Batismos';
    const r = domingosEmFalta({ ano: 2026, hoje: '2026-01-18', comunidades: COMS.slice(0, 1), assistencia: [l], excecoes: [], evento: 'celebração de domingo' });
    expect(r[0].comRegisto).toBe(1);
    expect(r[0].emFalta).toEqual(['2026-01-11']);
  });
});

describe('registos em falta: eventos com contagem obrigatória', () => {
  const ev = (nome: string, dias: number[], extra: Record<string, unknown> = {}) => ({ id: nome.toLowerCase().replace(/\s/g, '-'), nome, ativo: true, contagens: ['adultos'], dias, horario: { diaTodo: true as const }, ...extra });
  const lote = (com: string, registos: { data: string; evento: string }[]) => ({ id: `l-${com}`, origem: 'assistencia', ano: 2026, mes: 11, periodo: '2026-11', comunidadeId: com, registos: registos.map((r, i) => ({ id: `${com}${i}`, valor: 10, categoria: 'x', ...r })), total: 0, n: 0, atualizadoEm: '', atualizadoPor: '' });
  const coms = [{ id: 'almada', nome: 'Almada', ordem: 1 }, { id: 'moita', nome: 'Moita', ordem: 2 }] as never;
  it('só os eventos obrigatórios (a celebração por omissão) geram registos em falta, com a data e o evento', async () => {
    const { registosEmFalta } = await import('../../src/lib/domingos');
    const eventos = [ev('Celebração Domingo', [0]), ev('Reunião Oração', [3], { obrigatorio: true, obrigatorioDesde: '2026-11-01' }), ev('ATOS', [])];
    const r = registosEmFalta({
      ano: 2026, hoje: '2026-11-16', comunidades: coms, excecoes: [{ id: 'x', data: '2026-11-08', ambito: 'moita', motivo: 'culto conjunto', criadoPor: '', criadoEm: '' }],
      assistencia: [lote('almada', [{ data: '2026-11-01', evento: 'Celebração Domingo' }, { data: '2026-11-08', evento: 'celebração domingo' }, { data: '2026-11-15', evento: 'Celebração Domingo' }, { data: '2026-11-04', evento: 'Reunião Oração' }])] as never,
      eventos, eventoCelebracao: 'Celebração Domingo', desde: '2026-11-01',
    });
    expect(r.find((x) => x.comunidadeId === 'almada')).toEqual({ comunidadeId: 'almada', esperados: 5, comRegisto: 4, emFalta: [{ data: '2026-11-11', evento: 'Reunião Oração' }] });
    expect(r.find((x) => x.comunidadeId === 'moita')!.emFalta).toEqual([
      { data: '2026-11-01', evento: 'Celebração Domingo' }, { data: '2026-11-04', evento: 'Reunião Oração' }, { data: '2026-11-11', evento: 'Reunião Oração' }, { data: '2026-11-15', evento: 'Celebração Domingo' },
    ]);
  });
  it('a celebração deixa de ser obrigatória se for desmarcada', async () => {
    const { registosEmFalta } = await import('../../src/lib/domingos');
    const r = registosEmFalta({ ano: 2026, hoje: '2026-11-16', comunidades: coms, excecoes: [], assistencia: [], eventos: [ev('Celebração Domingo', [0], { obrigatorio: false })], eventoCelebracao: 'Celebração Domingo', desde: '2026-11-01' });
    expect(r).toEqual([]);
  });
});
