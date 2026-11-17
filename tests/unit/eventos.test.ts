import { describe, expect, it } from 'vitest';
import { CONTAGENS_BASE, catalogoContagens, descreverQuando, eventosEfetivos, eventosParaData, validarEvento, type EventoConfig } from '../../src/lib/eventos';

const culto: EventoConfig = { id: 'celebracao-domingo', nome: 'Celebração Domingo', descricao: 'Culto principal', ativo: true, contagens: ['adultos', 'jump', 'criancas', 'connects'], dias: [0], horario: { diaTodo: false, inicio: '10:30', fim: '12:30' } };
const oracao: EventoConfig = { id: 'reuniao-oracao', nome: 'Reunião Oração', ativo: true, contagens: ['adultos'], dias: [2, 4], horario: { diaTodo: false, inicio: '21:00' } };
const atos: EventoConfig = { id: 'atos', nome: 'ATOS', ativo: false, contagens: ['adultos'], dias: [], horario: { diaTodo: true } };

describe('configuração de eventos (modelo Church Metrics)', () => {
  it('sem configuração, deriva os eventos da lista antiga (celebração ao domingo, "Outra" pede descrição)', () => {
    const ev = eventosEfetivos({ eventoCelebracao: 'Celebração Domingo', eventos: ['Celebração Domingo', 'Reunião Oração', 'Outra'] });
    expect(ev.map((e) => e.nome)).toEqual(['Celebração Domingo', 'Reunião Oração', 'Outra']);
    expect(ev[0]).toMatchObject({ dias: [0], horario: { diaTodo: true }, contagens: CONTAGENS_BASE.map((c) => c.id), ativo: true });
    expect(ev[1].dias).toEqual([]);
    expect(ev[2].pedeDescricao).toBe(true);
    expect(eventosEfetivos(null).map((e) => e.nome)).toEqual(['Celebração Domingo', 'Reunião Oração', 'ATOS', 'Outra']);
  });
  it('com configuração, usa-a', () => {
    expect(eventosEfetivos({ eventoCelebracao: null, eventosConfig: [culto, oracao] })).toEqual([culto, oracao]);
  });
  it('só oferece os eventos ativos que ocorrem no dia da semana da data', () => {
    const todos = [culto, oracao, atos, { ...atos, id: 'x', nome: 'Qualquer', ativo: true }];
    expect(eventosParaData(todos, '2026-11-15').map((e) => e.nome)).toEqual(['Celebração Domingo', 'Qualquer']); // domingo
    expect(eventosParaData(todos, '2026-11-17').map((e) => e.nome)).toEqual(['Reunião Oração', 'Qualquer']); // terça
    expect(eventosParaData(todos, '').map((e) => e.nome)).toEqual(['Celebração Domingo', 'Reunião Oração', 'Qualquer']);
  });
  it('descreve quando ocorre', () => {
    expect(descreverQuando(culto)).toBe('Domingo · 10:30–12:30');
    expect(descreverQuando(oracao)).toBe('Terça e quinta · 21:00');
    expect(descreverQuando(atos)).toBe('Qualquer dia · dia todo');
  });
  it('catálogo de contagens: as base e as acrescentadas', () => {
    const cat = catalogoContagens({ eventoCelebracao: null, contagens: [{ id: 'online', nome: 'Online' }] });
    expect(cat.map((c) => c.id)).toEqual(['adultos', 'jump', 'criancas', 'connects', 'online']);
  });
  it('valida o evento', () => {
    expect(validarEvento(culto, [culto, oracao])).toBeNull();
    expect(validarEvento({ ...culto, nome: ' ' }, [])).toMatch(/nome/i);
    expect(validarEvento({ ...culto, id: 'novo', nome: 'reunião oração' }, [culto, oracao])).toMatch(/Já existe/);
    expect(validarEvento({ ...culto, contagens: [] }, [])).toMatch(/contagem/i);
    expect(validarEvento({ ...culto, horario: { diaTodo: false, inicio: '25:00' } }, [])).toMatch(/hora/i);
    expect(validarEvento({ ...culto, horario: { diaTodo: false, inicio: '12:00', fim: '11:00' } }, [])).toMatch(/depois/i);
  });
});
